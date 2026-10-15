import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageList } from '../../src/components/chat/MessageList';
import { applyEvents } from '../../src/components/chat/events';
import type { ChatMessage } from '../../src/components/chat/types';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/components/message-list.css';
import '../../src/styles/components/message.css';
import '../../src/styles/components/disclosure.css';
import '../../src/styles/components/tool-card.css';
import '../../src/styles/components/file-change-card.css';
import '../../src/styles/components/code-reasoning-transcript.css';
import '../../src/styles/components/event-flow.css';

const history: ChatMessage[] = [];
for (let index = 0; index < 100; index++) {
  const turnId = `user-${index}`;
  history.push(
    {id:turnId,kind:'text',role:'user',createdAt:index*10,text:`检查步骤 ${index}`},
    {id:`thought-${index}`,kind:'thinking',role:'assistant',createdAt:index*10+1,turnId,turn:1,summary:`核对步骤 ${index}`,preview:`步骤 ${index}：按模型内容块的接收顺序检查，原文完整保留。`,fullLength:30,partial:false},
    {id:`tool-${index}`,toolCallId:`call-${index}`,kind:'tool',role:'assistant',createdAt:index*10+2,turnId,tool:'Read',input:{file_path:`src/example-${index}.ts`},summary:`src/example-${index}.ts`,status:'done',outputText:'示例结果'},
    {id:`answer-${index}`,kind:'text',role:'assistant',createdAt:index*10+3,turnId,text:`步骤 ${index} 已核对。这里是独立正文，流程保持紧凑。`},
  );
}
const initial = [...history,{id:'live-user',kind:'text' as const,role:'user' as const,createdAt:2000,text:'流式示例：收到增量即显示。'}];
const full = '逐步核对消息顺序与布局。向上滚动时，尾部继续增长也不应把阅读位置拉走。'.repeat(200);
function ScrollFixture() {
  const [messages,setMessages]=useState<ChatMessage[]>(initial);
  const [running,setRunning]=useState(false);
  const [run,setRun]=useState(0);
  useEffect(()=>{
    if(!running)return;
    let length=0;
    let seq=0;
    const timer=window.setInterval(()=>{
      length=Math.min(full.length,length+8);
      const preview=full.slice(0,length);
      const partial=length<full.length;
      const event={type:'thinking' as const,seq:++seq,ts:Date.now(),turn:1,blockId:`live-${run}`,summary:'正在核对布局',preview,fullLength:length,partial};
      setMessages(previous=>applyEvents(previous,[event]));
      if(!partial)setRunning(false);
    },40);
    return()=>window.clearInterval(timer);
  },[running,run]);
  return <main style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    <header style={{padding:12,display:'flex',gap:12,alignItems:'center',flexShrink:0,fontSize:12}}>
      <button onClick={()=>{setMessages(initial);setRun(value=>value+1);setRunning(true);}}>开始流式示例</button>
      <button onClick={()=>setRunning(false)}>暂停示例</button>
      <span>100 轮示例数据 · 不执行工具</span>
    </header>
    <MessageList key={run} messages={messages} running={running} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<ScrollFixture/>);
