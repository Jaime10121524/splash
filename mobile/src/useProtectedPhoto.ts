import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchMobilePhoto} from './api';

/** Um único caminho de leitura segura, usado por avatar e fotos de venda. */
export function useProtectedPhoto(path:string|null,token:string|null|undefined){
  const [uri,setUri]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const seq=useRef(0);
  const reload=useCallback(async()=>{
    const id=++seq.current;
    if(!path||!token){setUri(null);setError('');setLoading(false);return;}
    setLoading(true);
    try{
      const next=await fetchMobilePhoto(path,token);
      if(id===seq.current){setUri(next);setError('');}
    }catch(e){
      if(id===seq.current){
        setUri(null);
        setError(e instanceof Error?e.message:'Não foi possível abrir a foto.');
      }
    }finally{if(id===seq.current)setLoading(false);}
  },[path,token]);
  useEffect(()=>{
    void reload();
    return ()=>{seq.current+=1;};
  },[reload]);
  return {uri,error,loading,reload,setUri};
}
