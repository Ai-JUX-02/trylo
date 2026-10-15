import { describe, expect, it } from 'vitest';
import { coalesceToolReplays } from './coalesce-tool-replays';
import { applyEvents } from './events';
import type { ChatMessage, ToolMessage } from './types';

const tool = (id: string, call: string, status: ToolMessage['status']): ToolMessage => ({
  id, toolCallId: call, kind: 'tool', role: 'assistant', createdAt: 2,
  tool: 'Bash', input: {command:'same command'}, summary: 'same command', status,
});
describe('workflow receipt identity and streaming order', () => {
  it('coalesces a replay at the first position without deleting real repeated commands', () => {
    const prose: ChatMessage = {id:'prose',kind:'text',role:'assistant',createdAt:3,text:'next'};
    const input = [tool('a','call-a','running'),prose,tool('b','call-a','done'),tool('c','call-b','done')];
    const output = coalesceToolReplays(input);
    expect(output.map(m=>m.id)).toEqual(['a','prose','c']);
    expect(output[0]).toMatchObject({status:'done'});
    expect(coalesceToolReplays([...input])[0]).toBe(output[0]);
    expect(input).toHaveLength(4);
    expect(coalesceToolReplays([tool('x','','done'),tool('y','','done')])).toHaveLength(2);
  });
  it('shows the very first reasoning delta and preserves block arrival order across updates', () => {
    const initial: ChatMessage[] = [{id:'u',kind:'text',role:'user',createdAt:1,text:'go'}];
    const delta = {type:'thinking' as const,seq:1,ts:2,turn:1,blockId:'a',summary:'查',preview:'查',fullLength:1,partial:true};
    const first = applyEvents(initial,[delta]);
    expect(first.at(-1)).toMatchObject({kind:'thinking',preview:'查',partial:true});
    const result = applyEvents(first,[
      {type:'text',seq:2,ts:3,turn:1,blockId:'b',preview:'我去检查',partial:false},
      {type:'tool_use',seq:3,ts:4,turn:1,id:'call',tool:'Read',input:{file_path:'a'}},
      {...delta,seq:4,ts:5,preview:'查完了',summary:'查完了',fullLength:3,partial:false},
    ]);
    expect(result.map(m=>m.kind)).toEqual(['text','thinking','text','tool']);
    expect(result[1]).toMatchObject({preview:'查完了'});
  });
});
