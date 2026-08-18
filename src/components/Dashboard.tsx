import { PieChart, ClipboardList, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import DepartmentProgress from './DepartmentProgress';
import { departments, Request, StatusType } from '@shared/schema';
import { Button } from "@/components/ui/button";

interface DashboardProps {
  requests: Request[];
  loading: boolean;
  onFilterChange?: (status: string | StatusType) => void;
}

export default function Dashboard({ requests, loading, onFilterChange }: DashboardProps) {
  // Format date string to Turkish locale
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR');
  };
  
  // Calculate department distribution
  const getDepartmentCounts = () => {
    const counts: Record<string, number> = {};
    
    departments.forEach(dept => {
      counts[dept] = requests.filter(req => req.department === dept).length;
    });
    
    return counts;
  };
  
  const departmentCounts = getDepartmentCounts();
  const totalRequests = requests.length;
  const pendingRequests = requests.filter(req => req.status === "beklemede").length;
  const completedRequests = requests.filter(req => req.status === "tamamlandı").length;
  const delayedRequests = requests.filter(req => req.status === "geciken").length;
  
  // Get the 5 most recent requests
  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {/* Total Requests Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onFilterChange && onFilterChange("all")}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Toplam İstek</p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-bold">{totalRequests}</p>
                )}
              </div>
              <div className="bg-primary/10 p-3 rounded-md">
                <ClipboardList className="h-8 w-8 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Pending Requests Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onFilterChange && onFilterChange("beklemede")}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Bekleyen İstekler</p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-yellow-600 animate-pulse">{pendingRequests}</p>
                )}
              </div>
              <div className="bg-yellow-100 p-3 rounded-md">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Delayed Requests Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onFilterChange && onFilterChange("geciken")}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Geciken İstekler</p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-red-600 animate-pulse">{delayedRequests}</p>
                )}
              </div>
              <div className="bg-red-100 p-3 rounded-md">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Completed Requests Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onFilterChange && onFilterChange("tamamlandı")}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Tamamlanan İstekler</p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-green-600">{completedRequests}</p>
                )}
              </div>
              <div className="bg-green-100 p-3 rounded-md">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="col-span-2">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Son İstekler</h3>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oda</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İstek</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departman</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentRequests.map((request) => (
                      <tr key={request.id} className={`hover:bg-gray-50 ${
                        request.status === "beklemede" ? "bg-yellow-50" : 
                        request.status === "geciken" ? "bg-red-50" : ""
                      }`}>
                        <td className="px-4 py-3 whitespace-nowrap">{request.roomNumber}</td>
                        <td className="px-4 py-3">{request.request}</td>
                        <td className="px-4 py-3">{request.department}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            request.status === "tamamlandı" ? "bg-green-100 text-green-800" :
                            request.status === "beklemede" ? "bg-yellow-100 text-yellow-800 animate-pulse" :
                            request.status === "geciken" ? "bg-red-100 text-red-800 animate-pulse" :
                            "bg-blue-100 text-blue-800"
                          }`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(request.createdAt.toString())}</td>
                      </tr>
                    ))}
                    {recentRequests.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-center text-gray-500">
                          Henüz bir istek yok
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Department Distribution */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Departman Dağılımı</h3>
            {loading ? (
              <div className="space-y-4">
                {departments.map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {departments.map((dept) => (
                  <DepartmentProgress 
                    key={dept}
                    name={dept}
                    count={departmentCounts[dept] || 0}
                    total={totalRequests}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
