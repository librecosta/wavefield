import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_SETTINGS, STUDY_HILLS, ARTICLE_PHASE, UNIFORM_FLOATS, terrainSample,
  seededHills, hillCenter, sceneField, projectPoint, gpuMeshBudget, gpuViewport,
  focusWeight, lineOptics, writeUniforms} from "../src/wave/gpu-terrain.ts";
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test("four anisotropic hills produce finite continuous world heights and correct analytic slopes",()=>{
  assert.equal(STUDY_HILLS.length,4);
  assert.equal(new Set(STUDY_HILLS.map(h=>h.width)).size,4);
  assert.deepEqual(seededHills(137),seededHills(137));
  assert.notDeepEqual(seededHills(137),seededHills(138));
  const e=1e-4;
  for(const time of [0,8,48,173,3600])for(let x=-6;x<=6;x+=0.6)for(let z=-4;z<=4;z+=0.8){
    const sample=terrainSample(x,z,time);
    for(const value of Object.values(sample))assert.ok(Number.isFinite(value));
    close(sample.dx,(terrainSample(x+e,z,time).height-terrainSample(x-e,z,time).height)/(2*e));
    close(sample.dz,(terrainSample(x,z+e,time).height-terrainSample(x,z-e,time).height)/(2*e));
    const normalLength=Math.hypot(-sample.dx,1,-sample.dz);
    assert.ok(normalLength>=1);
    assert.ok(Math.abs(terrainSample(x,z,time+1/24).height-sample.height)<0.004);
  }
  assert.notEqual(terrainSample(2,1,0).height,terrainSample(2,1,48).height);
  for(const value of Object.values(terrainSample(2,1,8,{...DEFAULT_SETTINGS,relief:0})))close(value,0);
});

test("focus isolates a narrow depth band; Gaussian widening conserves line energy",()=>{
  close(focusWeight(0.58),1);close(focusWeight(0.58+0.07),1);
  close(focusWeight(0),0);close(focusWeight(1),0);
  const near=lineOptics(0.58),far=lineOptics(0);
  assert.ok(far.sigma>near.sigma*6 && far.energy<near.energy/5);
  // Integral of a Gaussian is proportional to peak * sigma.
  close(far.sigma*far.energy,0.34*DEFAULT_SETTINGS.lineSize);
  const sharp=lineOptics(0,{...DEFAULT_SETTINGS,softness:0});
  close(sharp.sigma,near.sigma);
  close(near.sigma,0.4);close(far.sigma,3.1);
  close(Math.exp(-4.5),0.01110899654);
});

test("field projection has strong depth perspective, preserves aspect cropping and height direction",()=>{
  const wide=sceneField(1891,230),desktop=sceneField(1440,576),mobile=sceneField(390,422);
  const leftFar=projectPoint(0,0,0,wide),rightFar=projectPoint(1,0,0,wide);
  const leftNear=projectPoint(0,1,0,wide),rightNear=projectPoint(1,1,0,wide);
  close((rightNear.x-leftNear.x)/(rightFar.x-leftFar.x),1.45/0.65);
  assert.ok(projectPoint(0.5,0.6,1,wide).y<projectPoint(0.5,0.6,0,wide).y);
  assert.ok(rightFar.x>leftFar.x);
  // A tall viewport crops X using the 2.2 field-aspect minimum, not height distortion.
  assert.ok(projectPoint(0,0.6,0,mobile).x<0);
  assert.ok(projectPoint(1,0.6,0,mobile).x>390);
  close(projectPoint(0.5,0.6,0,mobile).y/422,projectPoint(0.5,0.6,0,desktop).y/576);
  const shifted=sceneField(1891,230,{...DEFAULT_SETTINGS,vertical:0.1});
  close(projectPoint(0.5,0.6,1,shifted).y-projectPoint(0.5,0.6,1,wide).y,23);
});

test("complete grid budget and texture sizing respect quality, DPR and device limits",()=>{
  const full=gpuMeshBudget(1440),small=gpuMeshBudget(390);
  assert.deepEqual(full,{columns:192,rows:112,nodeCount:21809,instanceCount:43008});
  assert.equal(small.instanceCount,2*128*96);
  assert.deepEqual(gpuMeshBudget(390,"reference"),full);
  assert.equal(gpuViewport(1440,576,2,8192).dpr,1.5);
  const huge=gpuViewport(20000,600,2,4096);
  assert.equal(huge.pixelWidth,4096);assert.ok(huge.pixelHeight<=4096);
  assert.equal(gpuViewport(0,0,0,8192).pixelWidth,1);
});

test("uniform packing agrees with the CPU field and keeps scene time separate from reveal",()=>{
  const data=new Float32Array(UNIFORM_FLOATS);
  const mesh=writeUniforms(data,1891,230,1.5,8,DEFAULT_SETTINGS);
  assert.equal(data.byteLength%16,0);assert.equal(data.length,52);
  assert.equal(data[10],mesh.nodeCount);assert.equal(data[19],1);
  close(data[2],0.075*(8+ARTICLE_PHASE),2e-5);
  for(let i=0;i<4;i++){
    const center=hillCenter(STUDY_HILLS[i],i,0.075*(8+ARTICLE_PHASE));
    close(data[32+i*4],center.x);close(data[33+i*4],center.z);
  }
  writeUniforms(data,1440,576,1,0,{...DEFAULT_SETTINGS,entrance:true});
  assert.equal(data[19],0);
  writeUniforms(data,1440,576,1,1.2,{...DEFAULT_SETTINGS,entrance:true});
  assert.equal(data[19],1);
});
