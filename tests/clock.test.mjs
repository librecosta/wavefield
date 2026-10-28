import test from "node:test";
import assert from "node:assert/strict";
import {FrameClock} from "../src/wave/clock.ts";

test("12/24 limits count actual submissions independently of RAF cadence and exact elapsed time",()=>{
  for(const limit of [12,24])for(const hz of [60,120,144]){
    const clock=new FrameClock(8);let draws=0;
    for(let index=0;index<=hz*10;index++)if(clock.step(index*1000/hz,1,true,true,limit))draws++;
    assert.ok(draws<=limit*10+1);assert.ok(draws>limit*7);
    assert.ok(Math.abs(clock.elapsed-18)<1e-6);
  }
});
test("pause, hidden/offscreen intervals and resource suspension do not advance time; edits draw once",()=>{
  const clock=new FrameClock(8);
  clock.step(0,1,true,true,24);clock.step(100,1,true,true,24);
  clock.suspend();clock.step(1000,1,true,false,24);clock.step(10000,1,true,false,24);
  clock.suspend();clock.invalidate();assert.equal(clock.step(20000,1,true,true,24),true);
  assert.ok(Math.abs(clock.elapsed-8.1)<1e-6);
  clock.suspend();clock.invalidate();assert.equal(clock.step(20100,1,false,true,24),true);
  for(let now=20200;now<24000;now+=100)assert.equal(clock.step(now,1,false,true,24),false);
  clock.seek(8);assert.equal(clock.step(25000,1,false,true,24),true);assert.equal(clock.elapsed,8);
});
