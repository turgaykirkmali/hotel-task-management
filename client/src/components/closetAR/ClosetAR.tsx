import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shirt, CircleUser, Sparkles, Camera, 
  CloudUpload, X, Heart, Edit, Trash2, Calendar, Clock, 
  HelpCircle, Search 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Kıyafet tipi ikonları
const categoryIcons: Record<string, React.ReactNode> = {
  'üst_giyim': <Shirt className="h-5 w-5" />,
  'alt_giyim': <span className="h-5 w-5 flex items-center justify-center text-gray-600">👖</span>,
  'ayakkabı': <span className="h-5 w-5 flex items-center justify-center text-gray-600">👟</span>,
  'dış_giyim': <Shirt className="h-5 w-5" />,
  'aksesuar': <span className="h-5 w-5 flex items-center justify-center text-gray-600">🧣</span>,
  'takı': <span className="h-5 w-5 flex items-center justify-center text-gray-600">💍</span>,
  'çanta': <span className="h-5 w-5 flex items-center justify-center text-gray-600">👜</span>
};

// Ana ClosetAR bileşeni
const ClosetAR: React.FC = () => {
  const { toast } = useToast();
  const [showCamera, setShowCamera] = useState(false);
  const [activeTab, setActiveTab] = useState("gardırop");

  // Kamerayı aç/kapat
  const toggleCamera = () => {
    setShowCamera(!showCamera);
  };

  // Yükleme işlemi (kamera yerine dosya yükleme)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Burada dosya işleme yapılacak
      toast({
        title: "Kıyafet Ekleniyor",
        description: "Kıyafet fotoğrafınız yükleniyor ve analiz ediliyor...",
      });
      // API çağrısı yapılacak
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex flex-col space-y-4">
        <header className="flex flex-col md:flex-row justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              ClosetAR
            </h1>
            <p className="text-slate-500 mt-1">
              Sanal Gardırobunuz ve Kişisel Stil Danışmanınız
            </p>
          </div>
          <div className="flex space-x-2 mt-4 md:mt-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleCamera}
              className="flex items-center gap-1"
            >
              <Camera className="h-4 w-4" />
              Kıyafet Ekle
            </Button>
            <label>
              <Input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*"
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1" 
                asChild
              >
                <span>
                  <CloudUpload className="h-4 w-4" />
                  Fotoğraf Yükle
                </span>
              </Button>
            </label>
          </div>
        </header>

        {/* Kamera açıksa göster */}
        {showCamera && (
          <Card className="w-full bg-gradient-to-br from-gray-50 to-slate-100 border-2 border-indigo-100">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xl font-medium">Kıyafet Ekle</CardTitle>
              <Button variant="ghost" size="icon" onClick={toggleCamera}>
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-100 rounded-lg p-8 flex flex-col items-center justify-center">
                <div className="text-center mb-4">
                  <Camera className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Kamera erişimi şu anda mevcut değil.
                  </p>
                </div>
                <p className="text-xs text-gray-400 text-center max-w-md">
                  Kamera erişimi için lütfen gerçek bir mobil cihaz kullanın veya fotoğraf yükleme özelliğini tercih edin.
                </p>
                <Button 
                  className="mt-4" 
                  variant="outline" 
                  onClick={toggleCamera}
                >
                  Kapat
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ana sekme yapısı */}
        <Tabs 
          defaultValue="gardırop" 
          className="w-full" 
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="grid grid-cols-5 sm:grid-cols-5 lg:w-[600px] mx-auto mb-8">
            <TabsTrigger value="gardırop" className="flex gap-2 items-center">
              <Shirt className="h-4 w-4" />
              <span className="hidden sm:inline">Gardırop</span>
            </TabsTrigger>
            <TabsTrigger value="kombinler" className="flex gap-2 items-center">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Kombinler</span>
            </TabsTrigger>
            <TabsTrigger value="öneriler" className="flex gap-2 items-center">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Öneriler</span>
            </TabsTrigger>
            <TabsTrigger value="istatistikler" className="flex gap-2 items-center">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">İstatistik</span>
            </TabsTrigger>
            <TabsTrigger value="profil" className="flex gap-2 items-center">
              <CircleUser className="h-4 w-4" />
              <span className="hidden sm:inline">Profil</span>
            </TabsTrigger>
          </TabsList>

          {/* Gardırop sekmesi */}
          <TabsContent value="gardırop">
            <Card>
              <CardHeader className="flex flex-row items-center">
                <div>
                  <CardTitle>Gardırop</CardTitle>
                  <CardDescription>
                    Tüm kıyafetlerinizi buradan yönetin
                  </CardDescription>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      type="search"
                      placeholder="Kıyafet ara..."
                      className="pl-8 w-full md:w-[200px]"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Kategorilere ayır */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Örnek kıyafet kartları */}
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <div key={item} className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow">
                      <div className="aspect-square bg-gray-100 relative">
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                          <Shirt className="h-16 w-16 opacity-20" />
                        </div>
                        <div className="absolute top-2 right-2 flex space-x-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full bg-white/80">
                            <Heart className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm">Siyah Tişört</h3>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500">12 Gün Önce Giyildi</span>
                          <div className="flex space-x-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Kombinler sekmesi */}
          <TabsContent value="kombinler">
            <Card>
              <CardHeader>
                <CardTitle>Kombinlerim</CardTitle>
                <CardDescription>
                  Oluşturduğunuz kıyafet kombinleri
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Yeni Kombin Oluştur */}
                  <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center min-h-[220px] text-center hover:bg-gray-50 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                      <Sparkles className="h-6 w-6 text-indigo-600" />
                    </div>
                    <h3 className="font-medium mb-1">Yeni Kombin Oluştur</h3>
                    <p className="text-sm text-gray-500 mb-4">Kıyafetlerinizden yeni bir kombin oluşturun</p>
                    <Button variant="outline" size="sm">
                      Kombin Oluştur
                    </Button>
                  </div>

                  {/* Örnek Kombinler */}
                  {[1, 2].map((item) => (
                    <div key={item} className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow">
                      <div className="aspect-video bg-gray-100 relative">
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                          <Sparkles className="h-12 w-12 opacity-20" />
                        </div>
                        <div className="absolute top-2 right-2 flex space-x-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full bg-white/80">
                            <Heart className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm">Günlük İş Kombini</h3>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500">Son giyilme: Geçen hafta</span>
                          <div className="flex space-x-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Öneriler sekmesi */}
          <TabsContent value="öneriler">
            <Card>
              <CardHeader>
                <CardTitle>Kişiselleştirilmiş Öneriler</CardTitle>
                <CardDescription>
                  Stilinize ve gardırobunuza özel tavsiyeler
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Bugünün kombini */}
                  <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-indigo-500" />
                        Bugünün Kombini
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="w-full md:w-1/3 aspect-square bg-white rounded-lg flex items-center justify-center">
                          <Sparkles className="h-12 w-12 text-indigo-200" />
                        </div>
                        <div className="w-full md:w-2/3">
                          <h3 className="font-medium mb-2">Günlük Şık Kombin</h3>
                          <p className="text-sm text-gray-600 mb-4">
                            Bugün için sıcaklık 22°C olacak ve hava açık. Ofis için rahat ama şık bir kombin öneririz.
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm">Kombini Gör</Button>
                            <Button size="sm" variant="outline">
                              <Clock className="h-4 w-4 mr-1" /> Sonra Hatırlat
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Eksik parçalar */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Gardıroba Eklenebilecek Parçalar</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                          Gardırobunuzu tamamlamak ve daha fazla kombinasyon oluşturmak için ekleyebileceğiniz parçalar:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {['Beyaz Basic Tişört', 'Lacivert Ceket', 'Bej Pantolon'].map((item, i) => (
                            <div key={i} className="border rounded-lg p-3 bg-gray-50">
                              <div className="flex items-center gap-2">
                                <Shirt className="h-5 w-5 text-indigo-400" />
                                <span className="font-medium text-sm">{item}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                12 farklı kombinasyon oluşturabilirsiniz
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* İstatistikler sekmesi */}
          <TabsContent value="istatistikler">
            <Card>
              <CardHeader>
                <CardTitle>Gardırop İstatistikleri</CardTitle>
                <CardDescription>
                  Kıyafet kullanım ve kombin istatistikleriniz
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* En çok giyilen kıyafetler */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">En Çok Giyilen Kıyafetler</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {['Siyah Tişört', 'Mavi Kot Pantolon', 'Beyaz Gömlek'].map((item, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-sm">{item}</span>
                            <span className="text-xs text-gray-500 ml-auto">{12 - i * 3} kez</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Hiç giyilmeyen kıyafetler */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Son 3 Aydır Giyilmeyen Kıyafetler</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {['Yeşil Kazak', 'Gri Ceket', 'Kahverengi Ayakkabı'].map((item, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-400"></div>
                            <span className="text-sm">{item}</span>
                            <span className="text-xs text-gray-500 ml-auto">{3 + i} aydır giyilmedi</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Kategori Dağılımı */}
                  <Card className="md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Kategori Dağılımı</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { name: 'Üst Giyim', count: 12, color: 'bg-blue-500' },
                          { name: 'Alt Giyim', count: 8, color: 'bg-purple-500' },
                          { name: 'Ayakkabı', count: 5, color: 'bg-yellow-500' },
                          { name: 'Dış Giyim', count: 3, color: 'bg-green-500' },
                          { name: 'Aksesuar', count: 7, color: 'bg-red-500' },
                        ].map((category, i) => (
                          <div key={i} className="flex-1 min-w-[120px] border rounded-lg p-3 text-center">
                            <div className={`w-4 h-4 rounded-full ${category.color} mx-auto mb-2`}></div>
                            <div className="font-medium text-sm">{category.name}</div>
                            <div className="text-2xl font-bold">{category.count}</div>
                            <div className="text-xs text-gray-500">parça</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profil sekmesi */}
          <TabsContent value="profil">
            <Card>
              <CardHeader>
                <CardTitle>Profil Ayarları</CardTitle>
                <CardDescription>
                  Kişisel bilgilerinizi ve uygulama tercihlerinizi yönetin.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                      <CircleUser className="h-8 w-8 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Profil Resmi</h3>
                      <p className="text-sm text-slate-500">Avatarınızı değiştirin veya kaldırın</p>
                    </div>
                    <Button variant="outline" size="sm" className="ml-auto">Değiştir</Button>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium">Hesap Bilgileri</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">İsim</label>
                        <Input placeholder="Adınız" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Soyisim</label>
                        <Input placeholder="Soyadınız" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">E-posta</label>
                        <Input type="email" placeholder="E-posta adresiniz" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Telefon</label>
                        <Input placeholder="Telefon numaranız" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button>Değişiklikleri Kaydet</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ClosetAR;