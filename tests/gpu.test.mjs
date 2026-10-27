import test from "node:test";
import assert from "node:assert/strict";
import {GpuRenderer} from "../src/wave/gpu-renderer.ts";
import {DEFAULT_SETTINGS} from "../src/wave/gpu-terrain.ts";
import {RendererSession,boundedInitialization} from "../src/wave/renderer-session.ts";
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
globalThis.GPUBufferUsage={UNIFORM:64,COPY_DST:8,STORAGE:128,COPY_SRC:4};

// Contract doubles cannot establish visual fidelity or WGSL compilation success.
function fixture(options={}){
  const lost=deferred(),events=new Map();
  const calls={destroyed:0,bufferDestroyed:0,unconfigured:0,submitted:0,devices:0,pipelines:0,computers:0,buffers:0};
  const layout={getBindGroupLayout:()=>({})};
  const device={limits:{maxTextureDimension2D:4096},lost:lost.promise,
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
    destroy:()=>{calls.destroyed++;lost.resolve({message:"Test destroyed"});},
    createShaderModule:()=>({getCompilationInfo:async()=>({messages:options.messages||[]})}),
    pushErrorScope:()=>{},popErrorScope:async()=>options.validation||null,
    createRenderPipelineAsync:async descriptor=>{calls.pipelines++;calls.pipeline=descriptor;if(options.pipelineFailure)throw Error("Test pipeline");return layout;},
    createComputePipelineAsync:async()=>{calls.computers++;if(options.computeFailure)throw Error("Test compute");return layout;},
    createBuffer:()=>{calls.buffers++;return{destroy:()=>calls.bufferDestroyed++};},createBindGroup:()=>({}),
    createCommandEncoder:()=>({
      beginComputePass:()=>({setPipeline:()=>{},setBindGroup:()=>{},dispatchWorkgroups:count=>{calls.dispatch=count;},end:()=>{}}),
      beginRenderPass:descriptor=>{calls.pass=descriptor;return{setPipeline:()=>{},setBindGroup:()=>{},draw:(...args)=>{calls.draw=args;},end:()=>{}};},
      finish:()=>({})}),
    queue:{writeBuffer:(_buffer,_offset,data)=>{calls.uniforms=[...data];},submit:()=>calls.submitted++}};
  const context={configure:config=>{calls.config=config;},unconfigure:()=>calls.unconfigured++,getCurrentTexture:()=>({createView:()=>({})})};
  const canvas={width:0,height:0,getContext:kind=>{assert.equal(kind,"webgpu");return options.noContext?null:context;}};
  const platform={secure:options.secure!==false,gpu:options.unsupported?undefined:{requestAdapter:async()=>options.noAdapter?null:{
    info:{vendor:"fixture",isFallbackAdapter:true},requestDevice:async()=>{calls.devices++;if(options.deviceFailure)throw Error("Test device");return options.devicePromise||device;}},getPreferredCanvasFormat:()=>"bgra8unorm"}};
  return{canvas,device,calls,events,platform};
}

test("one compute and one render pass share nodes, use premultiplied alpha, and release both buffers",async()=>{
  const f=fixture();let failures=0;
  const renderer=await GpuRenderer.create(f.canvas,()=>failures++,()=>false,f.platform);
  renderer.resize(1440,576,2);renderer.draw(8,DEFAULT_SETTINGS);
  assert.deepEqual(f.calls.draw,[6,43008]);assert.equal(f.calls.dispatch,Math.ceil(21809/64));
  assert.equal(f.calls.submitted,1);assert.equal(f.calls.config.alphaMode,"premultiplied");
  assert.deepEqual(f.calls.pass.colorAttachments[0].clearValue,{r:0,g:0,b:0,a:0});
  assert.equal(f.calls.pass.depthStencilAttachment,undefined);assert.equal(f.calls.pipeline.depthStencil,undefined);
  assert.equal(f.calls.pipeline.fragment.targets[0].blend.color.srcFactor,"one");
  renderer.resize(390,422,2);renderer.draw(8.1,DEFAULT_SETTINGS);renderer.draw(8.2,{...DEFAULT_SETTINGS,quality:"reference"});
  assert.deepEqual([f.calls.pipelines,f.calls.computers,f.calls.buffers,f.calls.submitted],[1,1,2,3]);
  assert.deepEqual([f.canvas.width,f.canvas.height],[585,633]);
  assert.deepEqual(f.calls.draw,[6,43008]);
  renderer.dispose();renderer.dispose();renderer.draw(9,DEFAULT_SETTINGS);await Promise.resolve();
  assert.deepEqual([f.calls.bufferDestroyed,f.calls.destroyed,f.calls.unconfigured,failures],[2,1,1,0]);
  assert.equal(f.events.size,0);assert.equal(f.canvas.width,0);
});

test("unsupported contexts, device rejection, shader/compute/pipeline failures clean up without retry loops",async()=>{
  for(const options of [{unsupported:true},{secure:false},{noAdapter:true},{deviceFailure:true},{noContext:true},
    {messages:[{type:"error",lineNum:1,linePos:2,message:"Test shader"}]},{pipelineFailure:true},{computeFailure:true},{validation:{message:"Test validation"}}]){
    const f=fixture(options);
    await assert.rejects(GpuRenderer.create(f.canvas,()=>{},()=>false,f.platform));
    const createsDevice=!(options.unsupported||options.secure===false||options.noAdapter);
    assert.equal(f.calls.devices,createsDevice?1:0);
    assert.equal(f.calls.destroyed,createsDevice&&!options.deviceFailure?1:0);
    assert.equal(f.events.size,0);
  }
});

test("late startup candidates and errors cannot commit after disposal",async()=>{
  const pending=deferred();let disposed=0,ready=0,errors=0;
  const session=new RendererSession(()=>errors++);
  const load=session.load(()=>pending.promise,()=>ready++);session.dispose();
  pending.resolve({dispose:()=>disposed++});await load;
  assert.deepEqual([disposed,ready,errors],[1,0,0]);
  const rejection=deferred(),old=new RendererSession(()=>errors++);
  const task=old.load(()=>rejection.promise,()=>ready++);old.dispose();rejection.reject(Error("late"));await task;
  assert.equal(errors,0);
});

test("late device requests are destroyed and timed out devices are discarded",async()=>{
  const pending=deferred(),f=fixture({devicePromise:pending.promise});let cancelled=false;
  const load=GpuRenderer.create(f.canvas,()=>{},()=>cancelled,f.platform);
  await Promise.resolve();await Promise.resolve();cancelled=true;pending.resolve(f.device);
  await assert.rejects(load,/cancelled/);assert.equal(f.calls.destroyed,1);
  let destroyed=0;const late=deferred();
  await assert.rejects(boundedInitialization(late.promise,"Test device",5,device=>device.destroy()),/timed out/);
  late.resolve({destroy:()=>destroyed++});await Promise.resolve();assert.equal(destroyed,1);
});

test("device loss and uncaptured errors fail once, dispose resources and never restart automatically",async()=>{
  for(const lost of [true,false]){
    const f=fixture();let errors=0,renderer;
    const session=new RendererSession(()=>errors++);
    await session.load(()=>GpuRenderer.create(f.canvas,error=>session.fail(error),()=>session.cancelled,f.platform),value=>{renderer=value;});
    if(lost)renderer.simulateDeviceLoss();else f.events.get("uncapturederror")({preventDefault:()=>{},error:{message:"Test validation"}});
    await Promise.resolve();await Promise.resolve();session.fail(Error("again"));session.dispose();
    assert.equal(errors,1);assert.equal(f.calls.devices,1);assert.equal(f.calls.bufferDestroyed,2);
  }
});
