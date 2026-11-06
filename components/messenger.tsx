'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

type Profile = { id: string; username: string; display_name: string; bio: string; avatar_color: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type Chat = { id: string; peer: Profile; last?: Message };
const colors = ['#725df7','#e96d96','#22a88a','#e49a43','#4d86e8','#af67cd'];
const initials = (s = '?') => s.trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || '?';
const time = (s: string) => new Date(s).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});

export default function Messenger() {
  const db = useMemo(() => getSupabase(), []);
  const [session,setSession] = useState<Session|null>(null);
  const [profile,setProfile] = useState<Profile|null>(null);
  const [chats,setChats] = useState<Chat[]>([]);
  const [active,setActive] = useState('');
  const [messages,setMessages] = useState<Message[]>([]);
  const [loading,setLoading] = useState(true);
  const [signup,setSignup] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [query,setQuery] = useState('');
  const [people,setPeople] = useState<Profile[]>([]);
  const [text,setText] = useState('');
  const [edit,setEdit] = useState(false);
  const [name,setName] = useState('');
  const [bio,setBio] = useState('');
  const [color,setColor] = useState(colors[0]);
  const user = session?.user;
  const current = chats.find(c => c.id === active);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    db.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false); });
    const {data:{subscription}} = db.auth.onAuthStateChange((_event,s) => { setSession(s); setLoading(false); if(!s){setProfile(null);setChats([]);setMessages([]);setActive('');} });
    return () => subscription.unsubscribe();
  },[db]);

  async function refresh() {
    if (!db || !user) return;
    const [{data:p},{data:mine}] = await Promise.all([
      db.from('profiles').select('*').eq('id',user.id).maybeSingle(),
      db.from('conversation_members').select('conversation_id').eq('user_id',user.id)
    ]);
    if (p) { setProfile(p as Profile); setName(p.display_name); setBio(p.bio||''); setColor(p.avatar_color||colors[0]); }
    const ids = [...new Set((mine||[]).map(r=>r.conversation_id as string))];
    if(!ids.length){setChats([]);return;}
    const [{data:members},{data:msgs}] = await Promise.all([
      db.from('conversation_members').select('conversation_id,user_id').in('conversation_id',ids).neq('user_id',user.id),
      db.from('messages').select('*').in('conversation_id',ids).order('created_at',{ascending:false}).limit(200)
    ]);
    const peerIds=[...new Set((members||[]).map(r=>r.user_id as string))];
    const {data:profiles}=peerIds.length?await db.from('profiles').select('*').in('id',peerIds):{data:[]};
    const latest=new Map<string,Message>();
    for(const m of (msgs||[]) as Message[]) if(!latest.has(m.conversation_id)) latest.set(m.conversation_id,m);
    const byId=new Map((profiles||[]).map(p=>[p.id,p as Profile]));
    const next:Chat[]=(members||[]).flatMap(r=>{const peer=byId.get(r.user_id);return peer?[{id:r.conversation_id,peer,last:latest.get(r.conversation_id)}]:[]});
    const unique=[...new Map(next.map(c=>[c.id,c])).values()].sort((a,b)=>(b.last?.created_at||'').localeCompare(a.last?.created_at||''));
    setChats(unique); setActive(old=>unique.some(c=>c.id===old)?old:unique[0]?.id||'');
  }
  useEffect(()=>{ if(user) void refresh(); },[user]);
  useEffect(()=>{ if(!db||!active){setMessages([]);return;} db.from('messages').select('*').eq('conversation_id',active).order('created_at').limit(500).then(({data})=>setMessages((data||[]) as Message[]));
    const channel=db.channel(`chat-${active}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${active}`},payload=>setMessages(old=>old.some(m=>m.id===payload.new.id)?old:[...old,payload.new as Message])).subscribe();
    return()=>{void db.removeChannel(channel)};
  },[db,active]);

  async function auth(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!db)return;setError('');setNotice('');const f=new FormData(e.currentTarget);const email=String(f.get('email')).trim();const password=String(f.get('password'));
    if(signup){const username=String(f.get('username')).trim().toLowerCase().replace(/^@/,'');const display_name=String(f.get('name')).trim();const {data,error}=await db.auth.signUp({email,password,options:{data:{username,display_name}}});if(error)setError(error.message);else if(!data.session)setNotice('Проверьте почту и подтвердите адрес.');}
    else {const {error}=await db.auth.signInWithPassword({email,password});if(error)setError(error.message);}
  }
  async function search(e:FormEvent){e.preventDefault();if(!db||!query.trim())return;const q=query.trim().replace(/[%_,]/g,'');const {data,error}=await db.from('profiles').select('*').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(12);if(error)setNotice(error.message);else setPeople(((data||[]) as Profile[]).filter(p=>p.id!==user?.id));}
  async function openChat(p:Profile){if(!db)return;const {data,error}=await db.rpc('start_conversation',{target_user:p.id});if(error){setNotice(error.message);return;}await refresh();setActive(data as string);setPeople([]);setQuery('');}
  async function send(e:FormEvent){e.preventDefault();const body=text.trim();if(!db||!user||!active||!body)return;setText('');const {error}=await db.from('messages').insert({conversation_id:active,sender_id:user.id,body});if(error){setText(body);setNotice(error.message);}else void refresh();}
  async function saveProfile(e:FormEvent){e.preventDefault();if(!db||!user)return;const {data,error}=await db.from('profiles').update({display_name:name.trim(),bio:bio.trim(),avatar_color:color}).eq('id',user.id).select().single();if(error)setNotice(error.message);else{setProfile(data as Profile);setEdit(false);}}
  if(!db)return <main className="center"><section className="setup"><b className="logo">b.</b><p className="tag">CHAT BY BARSIK</p><h1>Подключите Supabase</h1><p>Создайте <code>.env.local</code> из <code>.env.example</code>, добавьте ключи Supabase и выполните <code>supabase/schema.sql</code>.</p></section></main>;
  if(loading)return <main className="center">Загрузка…</main>;
  if(!user)return <main className="auth"><div className="auth-art"><span className="logo">b.</span><div><p>CHAT BY BARSIK</p><h2>Твои люди.<br/>Твой вайб.</h2><small>ПРОСТРАНСТВО ДЛЯ СВОИХ</small></div><i>✳</i></div><section className="auth-side"><header><span className="logo">b.</span> Chat by Barsik</header><div className="auth-card"><p className="tag">ТВОЙ МЕССЕНДЖЕР</p><h1>{signup?'Создай аккаунт':'С возвращением'}</h1><p className="sub">{signup?'Зарегистрируйся и начинай общаться.':'Войди, чтобы продолжить разговоры.'}</p><form onSubmit={auth} className="fields">{signup&&<><label>Имя<input name="name" required minLength={2} maxLength={40} placeholder="Как тебя зовут?"/></label><label>Ник<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="например, barsik_cat"/><small>Латиница, цифры и _</small></label></>}<label>Email<input name="email" type="email" required placeholder="you@example.com" autoComplete="email"/></label><label>Пароль<input name="password" type="password" required minLength={6} placeholder="Минимум 6 символов" autoComplete={signup?'new-password':'current-password'}/></label>{error&&<p className="error">{error}</p>}{notice&&<p className="success">{notice}</p>}<button className="primary">{signup?'Зарегистрироваться':'Войти'} <span>↗</span></button></form><p className="switch">{signup?'Уже есть аккаунт?':'Впервые здесь?'} <button onClick={()=>{setSignup(!signup);setError('');setNotice('')}}>{signup?'Войти':'Создать аккаунт'}</button></p></div></section></main>;
  return <main className="app"><aside className="sidebar"><header className="brand"><span className="logo">b.</span><b>Chat by Barsik<small>ТВОИ ЛЮДИ. ТВОЙ ВАЙБ.</small></b><button className="logout" onClick={()=>void db.auth.signOut()} title="Выйти">↗</button></header><form className="search" onSubmit={search}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти человека"/><button>↵</button></form>{notice&&<p className="notice">{notice}</p>}{people.length>0&&<div className="people"><small>НАЙДЕНЫ</small>{people.map(p=><button key={p.id} onClick={()=>void openChat(p)}><Avatar profile={p}/><span><b>{p.display_name}</b><small>@{p.username}</small></span>＋</button>)}</div>}<div className="list-title">СООБЩЕНИЯ <span>{chats.length}</span></div><div className="chats">{chats.map(c=><button key={c.id} className={`chat ${active===c.id?'selected':''}`} onClick={()=>setActive(c.id)}><Avatar profile={c.peer}/><span><b>{c.peer.display_name}</b><small>{c.last?.body||'Начните разговор'}</small></span>{c.last&&<time>{time(c.last.created_at)}</time>}</button>)}{!chats.length&&<p className="empty">Здесь пока пусто.<br/>Найдите человека и напишите первым.</p>}</div><button className="profile" onClick={()=>setEdit(true)}><Avatar profile={profile}/><span><b>{profile?.display_name||'Профиль'}</b><small>Настройки профиля</small></span>···</button></aside><section className="conversation">{current?<><header className="conv-head"><Avatar profile={current.peer}/><span><b>{current.peer.display_name}</b><small>@{current.peer.username}</small></span></header><div className="messages"><div className="intro"><Avatar profile={current.peer} large/><h2>{current.peer.display_name}</h2><p>@{current.peer.username} · Chat by Barsik</p></div>{messages.map(m=><div key={m.id} className={`row ${m.sender_id===user.id?'mine':''}`}><p>{m.body}<time>{time(m.created_at)}</time></p></div>)}</div><form className="composer" onSubmit={send}><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit()}}} placeholder="Сообщение…" maxLength={4000}/><button disabled={!text.trim()}>↑</button></form></>:<div className="welcome"><span className="welcome-icon">✳</span><p className="tag">CHAT BY BARSIK</p><h1>Пора начать<br/>новый разговор.</h1><p>Найди человека по имени или нику.</p></div>}</section>{edit&&<div className="backdrop" onClick={e=>{if(e.target===e.currentTarget)setEdit(false)}}><form className="modal" onSubmit={saveProfile}><button type="button" className="close" onClick={()=>setEdit(false)}>×</button><p className="tag">ТВОЙ ПРОФИЛЬ</p><h2>Настройки</h2><label>Имя<input value={name} onChange={e=>setName(e.target.value)} required maxLength={40}/></label><label>О себе<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160}/></label><div className="swatches">{colors.map(c=><button type="button" key={c} style={{background:c}} onClick={()=>setColor(c)} aria-label="Цвет аватара"/>)}</div><button className="primary">Сохранить</button></form></div>}</main>;
}
function Avatar({profile,large=false}:{profile:Profile|null;large?:boolean}){return <span className={`avatar ${large?'large':''}`} style={{background:profile?.avatar_color||colors[0]}}>{initials(profile?.display_name)}</span>}
