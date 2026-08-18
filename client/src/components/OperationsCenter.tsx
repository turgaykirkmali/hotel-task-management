import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock3, CheckCircle2, Users, BedDouble, ShieldCheck } from "lucide-react";
import { departments } from "@shared/schema";

export default function OperationsCenter({ hotelId }: { hotelId?: number }) {
  const [roomNumber, setRoomNumber] = useState("");
  const { data: executive } = useQuery<any>({ queryKey: ["/api/operations/executive", hotelId], queryFn: async()=>{ const u=hotelId?`/api/operations/executive?hotelId=${hotelId}`:"/api/operations/executive"; const r=await fetch(u); if(!r.ok) throw new Error("Operasyon verisi alınamadı"); return r.json(); } });
  const { data: rooms=[] } = useQuery<any[]>({ queryKey: ["/api/rooms", hotelId], queryFn: async()=>{ const u=hotelId?`/api/rooms?hotelId=${hotelId}`:"/api/rooms"; const r=await fetch(u); return r.json(); } });
  const { data: audits=[] } = useQuery<any[]>({ queryKey: ["/api/audit-logs", hotelId], queryFn: async()=>{ const u=hotelId?`/api/audit-logs?hotelId=${hotelId}`:"/api/audit-logs"; const r=await fetch(u); return r.json(); } });
  const addRoom = useMutation({ mutationFn:()=>apiRequest("POST","/api/rooms",{roomNumber}), onSuccess:()=>{setRoomNumber("");queryClient.invalidateQueries({queryKey:["/api/rooms",hotelId]});} });

  return <div className="p-6 space-y-6">
    <Tabs defaultValue="executive">
      <TabsList>
        <TabsTrigger value="executive">Yönetim Özeti</TabsTrigger>
        <TabsTrigger value="rooms">Oda Operasyonları</TabsTrigger>
        <TabsTrigger value="sla">SLA Ayarları</TabsTrigger><TabsTrigger value="audit">Audit Trail</TabsTrigger>
      </TabsList>
      <TabsContent value="executive" className="space-y-6 mt-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Metric title="Toplam Görev" value={executive?.total ?? 0} icon={<CheckCircle2 className="h-5 w-5"/>}/>
          <Metric title="Aktif" value={executive?.active ?? 0} icon={<Clock3 className="h-5 w-5"/>}/>
          <Metric title="SLA İhlali" value={executive?.overdue ?? 0} icon={<AlertTriangle className="h-5 w-5"/>}/>
          <Metric title="SLA Başarısı" value={`%${executive?.slaSuccess ?? 100}`} icon={<ShieldCheck className="h-5 w-5"/>}/>
          <Metric title="Ort. Süre" value={`${executive?.avgMinutes ?? 0} dk`} icon={<Clock3 className="h-5 w-5"/>}/>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle>Departman Performansı</CardTitle></CardHeader><CardContent className="space-y-4">
            {(executive?.departments ?? departments.map((d:string)=>({department:d,total:0,completed:0,overdue:0,slaSuccess:100,avgMinutes:0}))).map((d:any)=><div key={d.department}>
              <div className="flex justify-between text-sm mb-1"><span>{d.department}</span><span>%{d.slaSuccess} · {d.avgMinutes} dk</span></div>
              <Progress value={d.slaSuccess}/><div className="text-xs text-muted-foreground mt-1">{d.total} görev · {d.overdue} gecikmiş</div>
            </div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Personel Performansı</CardTitle></CardHeader><CardContent>
            <div className="space-y-2">{(executive?.staff ?? []).slice(0,8).map((p:any,i:number)=><div key={p.userId} className="flex items-center gap-3 border-b py-2 last:border-0"><div className="w-7 text-sm font-bold">{i+1}</div><Users className="h-4 w-4"/><div className="flex-1"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.completed}/{p.total} tamamlandı · {p.avgMinutes} dk</div></div><span className="font-semibold">%{p.slaSuccess}</span></div>)}</div>
          </CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="text-red-600">SLA İhlali / Geciken Görevler</CardTitle></CardHeader><CardContent><div className="space-y-2">{(executive?.recentOverdue ?? []).map((r:any)=><div key={r.id} className="flex justify-between items-center border rounded-md p-3"><div><b>#{r.id} · Oda {r.roomNumber}</b><div className="text-sm text-muted-foreground">{r.department} · {r.request}</div></div><span className="text-sm text-red-600">{r.deadline ? new Date(r.deadline).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}) : ""}</span></div>)}{!(executive?.recentOverdue?.length) && <div className="text-sm text-muted-foreground">Geciken görev bulunmuyor.</div>}</div></CardContent></Card>
      </TabsContent>
      <TabsContent value="rooms" className="mt-4 space-y-4">
        <Card><CardHeader><CardTitle>Oda Durumları</CardTitle></CardHeader><CardContent>
          <div className="flex gap-2 mb-4"><Input value={roomNumber} onChange={e=>setRoomNumber(e.target.value)} placeholder="Oda no (örn. 412)"/><Button disabled={!roomNumber || addRoom.isPending} onClick={()=>addRoom.mutate()}>Oda Ekle</Button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{rooms.map((r:any)=><RoomCard key={r.id} room={r} hotelId={hotelId}/>)}</div>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="sla" className="mt-4"><SlaPanel hotelId={hotelId}/></TabsContent>
      <TabsContent value="audit" className="mt-4"><Card><CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader><CardContent><div className="space-y-2">{audits.map((a:any)=><div key={a.id} className="border-b py-2 text-sm"><div className="font-medium">{a.action}</div><div className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("tr-TR")} · Kaynak: {a.source}</div><div className="text-xs">{a.details}</div></div>)}</div></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
function Metric({title,value,icon}:{title:string,value:any,icon:any}){return <Card><CardContent className="p-4"><div className="flex justify-between items-center"><div><div className="text-xs text-muted-foreground">{title}</div><div className="text-2xl font-bold mt-1">{value}</div></div><div className="p-2 rounded-md bg-primary/10 text-primary">{icon}</div></div></CardContent></Card>}

function RoomCard({room,hotelId}:{room:any,hotelId?:number}) {
  const [status,setStatus]=useState(room.status);
  const mutation=useMutation({mutationFn:(next:string)=>apiRequest("PATCH",`/api/rooms/${room.id}`,{status:next}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["/api/rooms",hotelId]})});
  return <div className="border rounded-lg p-3 bg-white"><div className="flex items-center gap-2"><BedDouble className="h-4 w-4"/><b>{room.roomNumber}</b></div><select className="mt-2 w-full border rounded px-2 py-1 text-xs" value={status} onChange={e=>{const next=e.target.value;setStatus(next);mutation.mutate(next);}}><option value="ready">Ready</option><option value="dirty">Dirty</option><option value="cleaning">Cleaning</option><option value="inspected">Inspected</option><option value="maintenance">Maintenance</option><option value="out_of_order">Out of Order</option><option value="dnd">DND</option></select><div className="text-xs text-muted-foreground mt-1">{room.note || "Not yok"}</div></div>
}
function SlaPanel({hotelId}:{hotelId?:number}) {
  const {data=[]}=useQuery<any[]>({queryKey:["/api/sla-policies",hotelId],queryFn:async()=>{const u=hotelId?`/api/sla-policies?hotelId=${hotelId}`:"/api/sla-policies";const r=await fetch(u);return r.json();}});
  return <Card><CardHeader><CardTitle>Departman SLA Politikaları</CardTitle></CardHeader><CardContent><div className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Departman</th><th className="text-left p-2">Düşük</th><th className="text-left p-2">Normal</th><th className="text-left p-2">Yüksek</th></tr></thead><tbody>{departments.map(d=><tr className="border-b" key={d}><td className="p-2 font-medium">{d}</td>{["low","normal","high"].map(p=>{const x=data.find((v:any)=>v.department===d&&v.priority===p);return <td className="p-2" key={p}>{x?.minutes ?? "-"} dk</td>})}</tr>)}</tbody></table></div></CardContent></Card>
}
