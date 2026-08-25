import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, CalendarIcon, Loader2, Eye as EyeIcon } from 'lucide-react';
import DepartmentProgress from './DepartmentProgress';
import { departments, Request, ReportType } from '@shared/schema';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { tr } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface ReportsProps {
  requests: Request[];
  reportType: ReportType;
  setReportType: (type: ReportType) => void;
  loading: boolean;
}

export default function Reports({ requests, reportType, setReportType, loading }: ReportsProps) {
  const [reportData, setReportData] = useState<Request[]>([]);
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);
  const [dateRange, setDateRange] = useState<{startDate: Date | undefined, endDate: Date | undefined}>({
    startDate: undefined,
    endDate: undefined
  });
  
  // Custom date range filter
  const applyCustomDateFilter = () => {
    if (!dateRange.startDate || !dateRange.endDate) return;
    
    // Set end date to end of day for inclusive filtering
    const endDateWithTime = new Date(dateRange.endDate);
    endDateWithTime.setHours(23, 59, 59, 999);
    
    const filteredData = requests.filter(req => {
      const createdDate = new Date(req.createdAt);
      return createdDate >= dateRange.startDate! && createdDate <= endDateWithTime;
    });
    
    setReportData(filteredData);
    setIsCustomDateRange(true);
  };

  // Filter report data based on selected time period
  useEffect(() => {
    if (isCustomDateRange && dateRange.startDate && dateRange.endDate) {
      applyCustomDateFilter();
      return;
    }
    
    const now = new Date();
    let filteredData: Request[] = [];
    
    if (reportType === "daily") {
      // Daily report - today
      filteredData = requests.filter(req => {
        const createdDate = new Date(req.createdAt);
        return createdDate.toDateString() === now.toDateString();
      });
      setIsCustomDateRange(false);
    } else if (reportType === "weekly") {
      // Weekly report - last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      filteredData = requests.filter(req => {
        const createdDate = new Date(req.createdAt);
        return createdDate >= weekAgo;
      });
      setIsCustomDateRange(false);
    } else if (reportType === "monthly") {
      // Monthly report - this month
      filteredData = requests.filter(req => {
        const createdDate = new Date(req.createdAt);
        return createdDate.getMonth() === now.getMonth() && 
              createdDate.getFullYear() === now.getFullYear();
      });
      setIsCustomDateRange(false);
    }
    
    setReportData(filteredData);
  }, [reportType, requests, isCustomDateRange, dateRange]);
  
  // Calculate statistics for the current report data
  const calculateStatistics = () => {
    const stats = {
      total: reportData.length,
      completed: reportData.filter(req => req.status === "tamamlandı").length,
      inProgress: reportData.filter(req => req.status === "işlemde").length,
      pending: reportData.filter(req => req.status === "beklemede").length,
      delayed: reportData.filter(req => req.status === "geciken").length,
      byDepartment: {} as Record<string, { total: number, completed: number, delayed: number }>
    };
    
    departments.forEach(dept => {
      const deptRequests = reportData.filter(req => req.department === dept);
      stats.byDepartment[dept] = {
        total: deptRequests.length,
        completed: deptRequests.filter(req => req.status === "tamamlandı").length,
        delayed: deptRequests.filter(req => req.status === "geciken").length
      };
    });
    
    return stats;
  };
  
  const stats = calculateStatistics();
  
  // Calculate average completion time for department
  const calculateAvgCompletionTime = (dept: string) => {
    const completedRequests = reportData.filter(
      req => req.department === dept && req.status === "tamamlandı" && req.completedAt
    );
    
    if (completedRequests.length === 0) return "-";
    
    const totalMinutes = completedRequests.reduce((sum, req) => {
      const created = new Date(req.createdAt).getTime();
      // Convert completedAt to string or use it directly if it's already a string
      const completedAtValue = typeof req.completedAt === 'string' ? req.completedAt : req.completedAt?.toString() || '';
      const completed = new Date(completedAtValue).getTime();
      return sum + (completed - created) / (1000 * 60); // Convert to minutes
    }, 0);
    
    const avgMinutes = Math.round(totalMinutes / completedRequests.length);
    
    if (avgMinutes < 60) return `${avgMinutes} dakika`;
    
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;
    
    return `${hours} saat ${minutes > 0 ? `${minutes} dakika` : ''}`;
  };

  // Generate a detailed multi-page PDF: summary + department analysis + every request.
  const downloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const title = isCustomDateRange
        ? `Ozel Rapor (${dateRange.startDate ? format(dateRange.startDate, "dd.MM.yyyy") : ""} - ${dateRange.endDate ? format(dateRange.endDate, "dd.MM.yyyy") : ""})`
        : reportType === "daily" ? "Gunluk Rapor" : reportType === "weekly" ? "Haftalik Rapor" : "Aylik Rapor";
      const nowText = format(new Date(), "dd.MM.yyyy HH:mm:ss");
      const duration = (req: Request) => {
        if (!req.completedAt) return "-";
        const mins = Math.max(0, Math.round((new Date(req.completedAt).getTime() - new Date(req.createdAt).getTime()) / 60000));
        return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)}s ${mins % 60}dk`;
      };
      doc.setFontSize(18); doc.text("Otel Operasyon Raporu", 14, 15);
      doc.setFontSize(11); doc.text(title, 14, 22); doc.text(`Olusturulma: ${nowText}`, 14, 28);
      doc.setFontSize(13); doc.text("Ozet", 14, 38);
      autoTable(doc, { startY: 42, head: [["Toplam", "Tamamlanan", "Islemde", "Beklemede", "Geciken", "Tamamlama %"]], body: [[stats.total, stats.completed, stats.inProgress, stats.pending, stats.delayed, stats.total ? `${Math.round(stats.completed / stats.total * 100)}%` : "0%"]], styles: { fontSize: 9 } });
      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(13); doc.text("Departman Analizi", 14, y); y += 4;
      const deptRows = departments.map(dept => { const d = stats.byDepartment[dept] || {total:0,completed:0,delayed:0}; return [dept, d.total, d.completed, d.total-d.completed, d.delayed, calculateAvgCompletionTime(dept)]; }).filter(r => Number(r[1]) > 0);
      autoTable(doc, { startY: y, head: [["Departman","Toplam","Tamamlanan","Bekleyen","Geciken","Ort. Sure"]], body: deptRows, styles:{fontSize:8}, margin:{left:14,right:14} });

      doc.addPage();
      doc.setFontSize(15); doc.text("Detayli Talep Listesi", 14, 15);
      const detailRows = reportData.map(req => [
        `#${req.id}`, req.roomNumber, req.department, req.priority || "normal", req.status,
        req.createdByUser ? `${req.createdByUser.firstName} ${req.createdByUser.lastName}` : "-",
        req.assignedUser ? `${req.assignedUser.firstName} ${req.assignedUser.lastName}` : "-",
        format(new Date(req.createdAt), "dd.MM.yyyy HH:mm"),
        req.completedAt ? format(new Date(req.completedAt), "dd.MM.yyyy HH:mm") : "-",
        duration(req),
        req.deadline ? format(new Date(req.deadline), "dd.MM.yyyy HH:mm") : "-",
        (req.request || "").replace(/\s+/g," ").slice(0, 70)
      ]);
      autoTable(doc, {
        startY: 20,
        head: [["ID","Oda","Departman","Oncelik","Durum","Olusturan","Atanan","Olusturma","Tamamlanma","Sure","Deadline","Talep"]],
        body: detailRows,
        styles:{fontSize:6.5,cellPadding:2,overflow:'linebreak'},
        headStyles:{fontSize:6.5},
        columnStyles:{0:{cellWidth:9},1:{cellWidth:12},2:{cellWidth:22},3:{cellWidth:13},4:{cellWidth:18},5:{cellWidth:25},6:{cellWidth:25},7:{cellWidth:27},8:{cellWidth:27},9:{cellWidth:14},10:{cellWidth:27},11:{cellWidth:50}},
        margin:{left:8,right:8,top:20,bottom:12},
        didDrawPage: data => { doc.setFontSize(7); doc.text(`Sayfa ${data.pageNumber}`, 270, 202); }
      });

      doc.addPage(); doc.setFontSize(15); doc.text("Talep Aciklama Ekleri", 14, 15);
      const appendixRows = reportData.map(req => [`#${req.id} / Oda ${req.roomNumber}`, `${req.department} / ${req.status}`, req.request || "-"]);
      autoTable(doc, { startY:20, head:[["Talep","Durum","Tam Aciklama"]], body:appendixRows, styles:{fontSize:8,cellPadding:3,overflow:'linebreak'}, columnStyles:{0:{cellWidth:35},1:{cellWidth:40},2:{cellWidth:190}}, margin:{left:8,right:8,top:20,bottom:12}, didDrawPage:data=>{doc.setFontSize(7);doc.text(`Sayfa ${data.pageNumber}`,270,202);} });
      const blob = doc.output('blob'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `otel-operasyon-raporu-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      alert("PDF oluşturulurken bir hata oluştu: " + error);
    }
  };

  return (
    <div className="p-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-center md:justify-between mb-6">
            <h3 className="text-lg font-semibold">Raporlar</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <Button 
                variant={(reportType === "daily" && !isCustomDateRange) ? "default" : "outline"}
                onClick={() => setReportType("daily")}
              >
                Günlük
              </Button>
              <Button 
                variant={(reportType === "weekly" && !isCustomDateRange) ? "default" : "outline"}
                onClick={() => setReportType("weekly")}
              >
                Haftalık
              </Button>
              <Button 
                variant={(reportType === "monthly" && !isCustomDateRange) ? "default" : "outline"}
                onClick={() => setReportType("monthly")}
              >
                Aylık
              </Button>
              
              <div className="flex flex-col md:flex-row gap-2 items-center">
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-[128px] justify-start text-left font-normal ${!dateRange.startDate && "text-muted-foreground"}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.startDate ? format(dateRange.startDate, "dd.MM.yyyy", { locale: tr }) : "Başlangıç"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateRange.startDate}
                        onSelect={(date) => setDateRange({...dateRange, startDate: date || undefined})}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  
                  <span className="text-sm text-gray-500">-</span>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-[128px] justify-start text-left font-normal ${!dateRange.endDate && "text-muted-foreground"}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.endDate ? format(dateRange.endDate, "dd.MM.yyyy", { locale: tr }) : "Bitiş"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateRange.endDate}
                        onSelect={(date) => setDateRange({...dateRange, endDate: date || undefined})}
                        initialFocus
                        disabled={(date) => dateRange.startDate ? date < dateRange.startDate : false}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <Button 
                  variant={isCustomDateRange ? "default" : "outline"}
                  onClick={applyCustomDateFilter}
                  disabled={!dateRange.startDate || !dateRange.endDate}
                >
                  Filtrele
                </Button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
              <Skeleton className="h-80 w-full" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-3">İstek Durumu Özeti</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Tamamlanan</span>
                        <span className="text-sm font-medium">{stats.completed} / {stats.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: stats.total ? `${(stats.completed / stats.total) * 100}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">İşlemde</span>
                        <span className="text-sm font-medium">{stats.inProgress} / {stats.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: stats.total ? `${(stats.inProgress / stats.total) * 100}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Beklemede</span>
                        <span className="text-sm font-medium">{stats.pending} / {stats.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full"
                          style={{ width: stats.total ? `${(stats.pending / stats.total) * 100}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-red-600 font-bold">Geciken</span>
                        <span className="text-sm font-medium text-red-600">{stats.delayed} / {stats.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-red-500 h-2 rounded-full"
                          style={{ width: stats.total ? `${(stats.delayed / stats.total) * 100}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-3">Departman Dağılımı</h4>
                  <div className="space-y-3">
                    {departments.map(dept => {
                      const deptTotal = stats.byDepartment[dept]?.total || 0;
                      if (deptTotal === 0 && stats.total === 0) return null;
                      
                      const percentage = stats.total ? Math.round((deptTotal / stats.total) * 100) : 0;
                      
                      return (
                        <div key={dept}>
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{dept}</span>
                            <span className="text-sm font-medium">
                              {deptTotal} ({percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {stats.total === 0 && (
                      <p className="text-sm text-gray-500">Bu dönemde herhangi bir istek bulunmamaktadır.</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departman</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam İstek</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tamamlanan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bekleyen</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geciken</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ortalama Tamamlanma Süresi</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {departments.map(dept => {
                      const deptStats = stats.byDepartment[dept] || { total: 0, completed: 0, delayed: 0 };
                      const pending = deptStats.total - deptStats.completed;
                      
                      return (
                        <tr key={dept} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{dept}</td>
                          <td className="px-4 py-3">{deptStats.total}</td>
                          <td className="px-4 py-3">{deptStats.completed}</td>
                          <td className="px-4 py-3">{pending}</td>
                          <td className="px-4 py-3 text-red-600 font-semibold">{deptStats.delayed}</td>
                          <td className="px-4 py-3">{calculateAvgCompletionTime(dept)}</td>
                        </tr>
                      );
                    })}
                    
                    {stats.total === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-center text-gray-500">
                          Bu dönemde herhangi bir istek bulunmamaktadır.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Liste görünümü */}
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-4">Talep Listesi</h3>
                <div className="overflow-x-auto bg-white rounded-lg shadow mb-8">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Oda</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Talep</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Departman</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Atanan</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Durum</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Tarih</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Detay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="text-center py-4">
                            <div className="flex justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                            </div>
                          </td>
                        </tr>
                      ) : reportData.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-4 text-gray-500">
                            Bu zaman aralığında talep bulunamadı
                          </td>
                        </tr>
                      ) : (
                        reportData.map((req) => (
                          <tr key={req.id} className="hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm">{req.roomNumber}</td>
                            <td className="py-3 px-4 text-sm">{req.request.substring(0, 30)}{req.request.length > 30 ? '...' : ''}</td>
                            <td className="py-3 px-4 text-sm">{req.department}</td>
                            <td className="py-3 px-4 text-sm">
                              {req.assignedUser 
                                ? `${req.assignedUser.firstName} ${req.assignedUser.lastName}` 
                                : 'Atanmadı'}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${
                                req.status === 'tamamlandı' ? 'bg-green-100 text-green-800' :
                                req.status === 'işlemde' ? 'bg-blue-100 text-blue-800' :
                                req.status === 'geciken' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm">{format(new Date(req.createdAt), 'dd.MM.yyyy')}</td>
                            <td className="py-3 px-4 text-sm">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <EyeIcon className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>İstek Detayı</DialogTitle>
                                    <DialogDescription>
                                      #{req.id} numaralı istek detayları
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="text-sm font-medium">Oda Numarası</h4>
                                        <p className="text-sm">{req.roomNumber}</p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Departman</h4>
                                        <p className="text-sm">{req.department}</p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Durum</h4>
                                        <p className="text-sm">
                                          <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${
                                            req.status === 'tamamlandı' ? 'bg-green-100 text-green-800' :
                                            req.status === 'işlemde' ? 'bg-blue-100 text-blue-800' :
                                            req.status === 'geciken' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                          }`}>
                                            {req.status}
                                          </span>
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Atanan Personel</h4>
                                        <p className="text-sm">
                                          {req.assignedUser 
                                            ? `${req.assignedUser.firstName} ${req.assignedUser.lastName}` 
                                            : 'Atanmadı'}
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Oluşturulma Tarihi</h4>
                                        <p className="text-sm">{format(new Date(req.createdAt), 'dd.MM.yyyy HH:mm')}</p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Tamamlanma Tarihi</h4>
                                        <p className="text-sm">{req.completedAt ? format(new Date(req.completedAt), 'dd.MM.yyyy HH:mm') : 'Tamamlanmadı'}</p>
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-medium">Tamamlayan Personel</h4>
                                        <p className="text-sm">
                                          {req.completedByUser 
                                            ? `${req.completedByUser.firstName} ${req.completedByUser.lastName}` 
                                            : (req.status === 'tamamlandı' ? 'Bilinmiyor' : 'Tamamlanmadı')}
                                        </p>
                                      </div>
                                      <div className="col-span-2">
                                        <h4 className="text-sm font-medium">İstek Detayı</h4>
                                        <p className="text-sm whitespace-pre-wrap">{req.request}</p>
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <Button 
                    onClick={downloadPDF}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF İndir
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
