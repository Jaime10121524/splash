/* SW apenas para Web Push e abertura do aplicativo; não armazena dados financeiros offline. */
self.addEventListener('push',event=>{
 let data={};
 try {data=event.data?event.data.json():{}}catch {data={}}
 const title=typeof data.title==='string'?data.title:'SPLASH'
 const body=typeof data.body==='string'?data.body:'Você tem uma nova notificação.'
 const raw=typeof data.url==='string'?data.url:'/'
 const url=raw.startsWith('/')&&!raw.startsWith('//')?raw:'/'
 event.waitUntil(self.registration.showNotification(title,{
  body,tag:data.tag||'splash',icon:'/favicon.svg',badge:'/favicon.svg',
  data:{url},renotify:false,
 }))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 const url=new URL(event.notification.data?.url||'/',self.location.origin)
 if(url.origin!==self.location.origin)return
 event.waitUntil((async()=>{
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true})
  for(const client of windows){
   if(new URL(client.url).origin===url.origin){
    await client.navigate(url.href)
    return client.focus()
   }
  }
  return clients.openWindow(url.href)
 })())
})
