import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { departments, Request, StatusType } from '@shared/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { User as UserIcon, UserCheck, Calendar, Clock } from "lucide-react";

interface RequestsListProps {
  requests: Request[];
  filterStatus: string | StatusType;
  setFilterStatus: (status: string | StatusType) => void;
  filterDepartment: string;
  setFilterDepartment: (department: string) => void;
  updateRequestStatus: any;
  loading: boolean;
}

export default function RequestsList({ 
  requests, 
  filterStatus, 
  setFilterStatus,
  filterDepartment,
  setFilterDepartment,
  updateRequestStatus,
  loading
}: RequestsListProps) {
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const { data: userData } = useQuery({
    queryKey: ['/api/user'],
    queryFn: async () => {
      const res = await fetch('/api/user');
      if (!res.ok) throw new Error('Failed to fetch user data');
      return await res.json();
    }
  });
  
  useEffect(() => {
    if (userData) setCurrentUser(userData);
  }, [userData]);

  const assignRequestMutation = useMutation({
    mutationFn: async ({ requestId, userId }: { requestId: number, userId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/requests/${requestId}/assign`, { assignedToId: userId });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
      setIsAssignDialogOpen(false);
    }
  });
  
  const openAssignDialog = (request: Request) => {
    setSelectedRequest(request);
    setIsAssignDialogOpen(true);
  };
  
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString.toString());
    return date.toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatDateShort = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString.toString());
    return date.toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const { data: departmentUsers, isLoading: loadingUsers } = useQuery({
    queryKey: [
      `/api/hotels/${selectedRequest?.hotelId}/department/${selectedRequest?.department}/users`,
    ],
    queryFn: async () => {
      if (!selectedRequest?.hotelId || !selectedRequest?.department) return [];
      const res = await fetch(
        `/api/hotels/${selectedRequest.hotelId}/department/${selectedRequest.department}/users`
      );
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!selectedRequest && isAssignDialogOpen,
  });

  return (
    <div className="p-6">
      {/* Personel Atama Diyaloğu */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>İsteği Personele Ata</DialogTitle>
            <DialogDescription>
              Bu isteği işlemek için bir personel seçin ya da atamayı kaldırın.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="py-4">
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <h4 className="font-medium">İstek #{selectedRequest.id}</h4>
                <p className="text-sm text-gray-600 mt-1">{selectedRequest.request}</p>
                <div className="mt-2 text-xs text-gray-500">
                  <span className="font-medium">{selectedRequest.department}</span> • 
                  <span className="ml-1">Oda {selectedRequest.roomNumber}</span>
                </div>
              </div>
              
              {loadingUsers ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div>
                  <h4 className="text-sm font-medium mb-2">Personel Seç</h4>
                  {departmentUsers && departmentUsers.length > 0 ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      <div 
                        className={`flex items-center p-2 rounded-md cursor-pointer hover:bg-gray-100 ${
                          selectedRequest.assignedToId === null ? 'bg-blue-50 border border-blue-200' : ''
                        }`}
                        onClick={() => assignRequestMutation.mutate({ requestId: selectedRequest.id, userId: null })}
                      >
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          <UserIcon className="h-4 w-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium">Atanmamış</p>
                          <p className="text-xs text-gray-500">İsteği atanmamış olarak işaretle</p>
                        </div>
                      </div>
                      {departmentUsers.map((user: User) => (
                        <div 
                          key={user.id}
                          className={`flex items-center p-2 rounded-md cursor-pointer hover:bg-gray-100 ${
                            selectedRequest.assignedToId === user.id ? 'bg-blue-50 border border-blue-200' : ''
                          }`}
                          onClick={() => assignRequestMutation.mutate({ requestId: selectedRequest.id, userId: user.id })}
                        >
                          <div className="h-8 w-8 rounded-full bg-blue-200 flex items-center justify-center mr-3">
                            <UserIcon className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-gray-500">{user.username}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500 border border-dashed rounded-md">
                      <p>Bu departmanda personel bulunamadı</p>
                      <p className="text-xs mt-1">Önce bu departmana personel eklemelisiniz</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h3 className="text-lg font-semibold mb-2 md:mb-0">İstek Listesi</h3>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tüm İstekler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm İstekler</SelectItem>
                  <SelectItem value="beklemede">Beklemede</SelectItem>
                  <SelectItem value="işlemde">İşlemde</SelectItem>
                  <SelectItem value="tamamlandı">Tamamlandı</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterDepartment} onValueChange={(value) => setFilterDepartment(value)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tüm Departmanlar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Departmanlar</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oda</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İstek</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departman</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oluşturan</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Atanan Personel</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih / Saat</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr 
                      key={request.id} 
                      id={`request-${request.id}`}
                      className={`hover:bg-gray-50 transition-colors duration-300 ${
                        request.status === "beklemede" ? "bg-yellow-50" : 
                        request.status === "geciken" ? "bg-red-50" : 
                        ""
                      }`}
                    >
                      <td className="px-3 py-3 whitespace-nowrap font-medium text-gray-700">#{request.id}</td>
                      <td className="px-3 py-3 whitespace-nowrap font-semibold">{request.roomNumber}</td>
                      <td className="px-3 py-3 max-w-[180px]">
                        <span className="line-clamp-2">{request.request}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{request.department}</td>

                      {/* Oluşturan kolonu */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(request as any).createdByUser ? (
                          <span className="inline-flex items-center gap-1 text-gray-700">
                            <UserIcon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            <span className="font-medium">
                              {(request as any).createdByUser.firstName} {(request as any).createdByUser.lastName}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Atanan personel */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {request.assignedToId ? (
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            <span>
                              {request.assignedUser ? 
                                `${request.assignedUser.firstName} ${request.assignedUser.lastName}` : 
                                'Atanmış'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <UserIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>Atanmamış</span>
                          </span>
                        )}
                      </td>

                      {/* Durum */}
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                          request.status === "tamamlandı" ? "bg-green-100 text-green-800" :
                          request.status === "beklemede" ? "bg-yellow-100 text-yellow-800 animate-pulse" :
                          request.status === "geciken" ? "bg-red-100 text-red-800 animate-pulse" :
                          "bg-blue-100 text-blue-800"
                        }`}>
                          {request.status}
                        </span>
                      </td>

                      {/* Tarih / Saat log */}
                      <td className="px-3 py-3">
                        <div className="space-y-1 min-w-[130px]">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="h-3 w-3 shrink-0 text-gray-400" />
                            <span className="font-medium text-gray-600">Oluşturulma:</span>
                          </div>
                          <div className="text-xs text-gray-700 pl-4">
                            {formatDateShort(request.createdAt)}
                          </div>
                          {request.status === "tamamlandı" && request.completedAt && (
                            <>
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                <Clock className="h-3 w-3 shrink-0 text-green-500" />
                                <span className="font-medium text-green-700">Tamamlanma:</span>
                              </div>
                              <div className="text-xs text-green-700 pl-4">
                                {formatDateShort(request.completedAt)}
                              </div>
                              {request.completedByUser && (
                                <div className="text-xs text-gray-500 pl-4">
                                  <span className="font-medium">
                                    {request.completedByUser.firstName} {request.completedByUser.lastName}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          {request.deadline && request.status !== "tamamlandı" && (
                            <>
                              <div className="flex items-center gap-1 text-xs mt-1">
                                <Clock className="h-3 w-3 shrink-0 text-orange-400" />
                                <span className="font-medium text-orange-600">Son tarih:</span>
                              </div>
                              <div className="text-xs text-orange-600 pl-4">
                                {formatDateShort(request.deadline)}
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* İşlemler */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {request.status !== "tamamlandı" ? (
                          <div className="flex flex-wrap gap-1">
                            {currentUser && (currentUser.role === "admin" || currentUser.role === "superadmin") && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="border-blue-300 text-blue-600 hover:bg-blue-50 text-xs px-2 py-1 h-7"
                                onClick={() => openAssignDialog(request)}
                              >
                                <UserIcon className="h-3 w-3 mr-1" />
                                Ata
                              </Button>
                            )}
                            {(request.status === "beklemede" || request.status === "geciken") && (
                              <Button 
                                size="sm"
                                className="bg-blue-500 text-white hover:bg-blue-600 text-xs px-2 py-1 h-7"
                                onClick={() => updateRequestStatus.mutate({ id: request.id, status: "işlemde" })}
                              >
                                İşleme Al
                              </Button>
                            )}
                            <Button 
                              size="sm"
                              className="bg-green-500 text-white hover:bg-green-600 text-xs px-2 py-1 h-7"
                              onClick={() => updateRequestStatus.mutate({ id: request.id, status: "tamamlandı" })}
                            >
                              Tamamla
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        Bu kriterlere uygun istek bulunamadı
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
