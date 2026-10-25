'use client';
import {useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track,createLocalTracks} from 'livekit-client';
import {api} from './api';
export default function MediaRoom({sid,token,phone=false,viewer=false}:{sid:string;token:string;phone?:boolean;viewer?:boolean}){
 const host=useRef<HTMLDivElement>(null);const [status,setStatus]=useState('Connecting media…');
 useEffect(()=>{let closed=false;const room=new Room();const nodes=new Map<string,HTMLElement>();
 const attach=(track:any,id:string)=>{if(closed)return;const el=track.attach();el.autoplay=true;el.setAttribute('playsinline','');if(track.kind==='video'){el.setAttribute('aria-label',id);el.title=id;}host.current?.appendChild(el);nodes.set(track.sid||id,el)};
 room.on(RoomEvent.TrackSubscribed,(track,pub,p)=>attach(track,p.identity));
 room.on(RoomEvent.TrackUnsubscribed,(track)=>{track.detach().forEach(el=>el.remove())});
 room.on(RoomEvent.Reconnecting,()=>setStatus('Reconnecting · coverage may be interrupted'));
 room.on(RoomEvent.Reconnected,()=>setStatus('Media connected'));
 room.on(RoomEvent.Disconnected,()=>setStatus('Media disconnected'));
 room.on(RoomEvent.TrackMuted,()=>setStatus('A media track is muted'));
 (async()=>{try{const creds=await api(`/sessions/${sid}/media`,token,'POST');if(closed)return;await room.connect(creds.url,creds.token);if(closed){await room.disconnect();return}
 if(!viewer){const tracks=await createLocalTracks({audio:phone?false:{echoCancellation:true,noiseSuppression:true},video:{facingMode:phone?'environment':'user',resolution:{width:640,height:480,frameRate:15}}});
 for(const t of tracks){if(closed){t.stop();continue}await room.localParticipant.publishTrack(t);if(t.kind==='video'){const el=t.attach();el.muted=true;el.setAttribute('playsinline','');host.current?.appendChild(el)}}}
 setStatus(phone?'Phone connected · video only':'Media connected');await room.startAudio();
 }catch(e){setStatus((e as Error).message)}})();
 return()=>{closed=true;room.localParticipant.trackPublications.forEach(p=>p.track?.stop());void room.disconnect();host.current?.replaceChildren()};
 },[sid,token,phone,viewer]);
 return <section className="media"><div ref={host} className="feeds"/><div className="mediaStatus"><span className="dot"/>{status}</div><small>Only the visible camera area is covered. Camera events do not establish cheating.</small></section>
}
