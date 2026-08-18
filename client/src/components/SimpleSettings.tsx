import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from 'lucide-react';

interface SimpleSettingsProps {
  currentHotelId?: number | null;
}

export default function SimpleSettings({ currentHotelId }: SimpleSettingsProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Basit kullanıcı bilgileri sorgusu
  const { data: currentUser, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['/api/user'],
  });

  // Hata durumunu kontrol et
  useEffect(() => {
    if (userError) {
      setErrorMessage('Kullanıcı bilgileri yüklenirken bir hata oluştu.');
      console.error('User data error:', userError);
    }
  }, [userError]);

  // Yükleme durumunda loading göster
  if (userLoading) {
    return (
      <div className="flex items-center justify-center p-6 min-h-[500px]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Ayarlar yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Hata durumunda hata mesajı göster
  if (errorMessage) {
    return (
      <div className="p-6">
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center text-red-500">
              <p className="mb-2 font-semibold">Hata</p>
              <p>{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal durum - basit bir kart içeriği
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Basit Ayarlar Sayfası</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Merhaba, {currentUser?.firstName || currentUser?.username || 'Kullanıcı'}</p>
          <p className="mt-2">Aktif Otel ID: {currentHotelId || 'Seçili değil'}</p>
          <p className="mt-2">Rol: {currentUser?.role || 'Bilinmiyor'}</p>
        </CardContent>
      </Card>
    </div>
  );
}