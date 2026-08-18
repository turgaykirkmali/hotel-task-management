import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { departments } from '@shared/schema';

interface NewRequestProps {
  onSuccess: () => void;
}

export default function NewRequest({ onSuccess }: NewRequestProps) {
  const { toast } = useToast();
  const [newRequest, setNewRequest] = useState({
    roomNumber: "",
    request: "",
    department: "Kat Hizmetleri"
  });
  
  // Create new request mutation
  const createRequest = useMutation({
    mutationFn: async (requestData: typeof newRequest) => {
      const authResponse = await fetch('/api/user');
      if (!authResponse.ok) {
        throw new Error('Kullanıcı bilgileri alınamadı');
      }
      const currentUser = await authResponse.json();
      
      // Mevcut kullanıcının otel ID'sini isteğe ekle
      const requestWithHotelId = {
        ...requestData,
        hotelId: currentUser.hotelId || 1,
      };
      console.log('Creating request with data:', requestWithHotelId);
      return apiRequest('POST', '/api/requests', requestWithHotelId);
    },
    onSuccess: () => {
      toast({
        title: "İstek oluşturuldu",
        description: "İstek başarıyla oluşturuldu ve ilgili personele atandı.",
      });
      setNewRequest({
        roomNumber: "",
        request: "",
        department: "Kat Hizmetleri"
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Hata",
        description: `İstek oluşturulurken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newRequest.roomNumber || !newRequest.request || !newRequest.department) {
      toast({
        title: "Hata",
        description: "Lütfen tüm alanları doldurunuz.",
        variant: "destructive",
      });
      return;
    }
    
    createRequest.mutate(newRequest);
  };
  
  // Handle form change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewRequest(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle department selection
  const handleDepartmentChange = (value: string) => {
    setNewRequest(prev => ({ ...prev, department: value }));
  };
  
  // Clear form
  const handleClear = () => {
    setNewRequest({
      roomNumber: "",
      request: "",
      department: "Kat Hizmetleri"
    });
  };
  
  return (
    <div className="p-6">
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-6">Yeni İstek Oluştur</h3>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="roomNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Oda Numarası <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                id="roomNumber"
                name="roomNumber"
                value={newRequest.roomNumber}
                onChange={handleChange}
                placeholder="101"
                required
              />
            </div>
            
            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                Departman <span className="text-red-500">*</span>
              </label>
              <Select 
                value={newRequest.department} 
                onValueChange={handleDepartmentChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Departman seçiniz" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label htmlFor="request" className="block text-sm font-medium text-gray-700 mb-1">
                İstek Detayı <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="request"
                name="request"
                value={newRequest.request}
                onChange={handleChange}
                placeholder="İstek detaylarını yazınız"
                rows={4}
                required
              />
            </div>
            
            <div className="flex items-center justify-end space-x-3">
              <Button 
                type="button" 
                variant="outline"
                onClick={handleClear}
                disabled={createRequest.isPending}
              >
                Temizle
              </Button>
              <Button 
                type="submit"
                disabled={createRequest.isPending}
              >
                {createRequest.isPending ? "Oluşturuluyor..." : "İstek Oluştur"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
