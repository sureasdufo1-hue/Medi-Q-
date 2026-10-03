import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../integration/authorized-source-capture.orthanc.integration.test.mjs',import.meta.url),'utf8');
const ast=ts.createSourceFile('capture.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const expressions=[];
function visit(node) { if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='monitored') expressions.push(node.initializer);ts.forEachChild(node,visit); }
visit(ast); assert.equal(expressions.length,1);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(error) {
  const failures=[],cancellations=[];let calls=0;
  const runtime=runInNewContext(`let activeTenantTransactions=0; const initialAuthorizationCommitted=true;
    const assertOutsideTransaction=()=>assert.equal(activeTenantTransactions,0);
    const monitored=${expressions[0].getText(ast)};
    ({monitored,setActive:n=>{activeTenantTransactions=n;}})`,{
    ReadableStream,assert,reader:{async read(){calls++;if(error)throw error;
      return calls<=2?{done:false,value:new Uint8Array([calls])}:{done:true};},
    async cancel(reason){cancellations.push(reason);}},
    recordSourceFailure:(stage,cause)=>failures.push({stage,assertion:cause?.code==='ERR_ASSERTION'}),
  });
  const consumer=runtime.monitored.getReader();
  return {...runtime,consumer,failures,cancellations,calls:()=>calls,async close(){await consumer.cancel().catch(()=>{});consumer.releaseLock();}};
}
test('actual source monitor performs no transport read before demand',async()=>{
  const h=harness();try {await tick();assert.equal(h.calls(),0);assert.deepEqual(h.failures,[]);}finally{await h.close();}
});
test('actual source monitor never speculates while consumer pauses for a transaction',async()=>{
  const h=harness();try {
    assert.deepEqual([...(await h.consumer.read()).value],[1]);h.setActive(1);await tick();
    assert.equal(h.calls(),1);assert.deepEqual(h.failures,[]);
    h.setActive(0);assert.deepEqual([...(await h.consumer.read()).value],[2]);
  }finally{await h.close();}
});
test('demand during an active transaction still fails the unchanged assertion',async()=>{
  const h=harness();try {
    h.setActive(1);await assert.rejects(h.consumer.read(),e=>e?.code==='ERR_ASSERTION');
    assert.equal(h.calls(),0);assert.deepEqual(h.failures,[{stage:'HTTP_BODY',assertion:true}]);
  }finally{await h.close();}
});
test('actual source monitor forwards ordered bytes and EOF without extra reads',async()=>{
  const h=harness();try {
    assert.deepEqual([...(await h.consumer.read()).value],[1]);
    assert.deepEqual([...(await h.consumer.read()).value],[2]);
    assert.equal((await h.consumer.read()).done,true);assert.equal(h.calls(),3);assert.deepEqual(h.failures,[]);
  }finally{await h.close();}
});
test('actual source monitor preserves source error identity with fixed stage diagnostics',async()=>{
  const error=new Error('TEST-ONLY-SOURCE-ERROR'),h=harness(error);try {
    await assert.rejects(h.consumer.read(),e=>e===error);assert.equal(h.calls(),1);
    assert.deepEqual(h.failures,[{stage:'HTTP_BODY',assertion:false}]);
  }finally{await h.close();}
});
test('actual source monitor forwards cancellation without reading',async()=>{
  const h=harness();try {
    await h.consumer.cancel('TEST-ONLY-CANCEL');await tick();
    assert.equal(h.calls(),0);assert.deepEqual(h.cancellations,['TEST-ONLY-CANCEL']);
  }finally{await h.close();}
});
