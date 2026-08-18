import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Award, 
  Clock, 
  Users, 
  ThumbsUp,
  RefreshCw,
  Trophy,
  Search,
  BadgeCheck,
  Loader2,
  UserPlus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Rozet türüne göre ikon belirleme
const BadgeIcons: Record<string, React.ReactNode> = {
  "hız_rozeti": <Clock className="h-5 w-5 text-blue-500" />,
  "kalite_rozeti": <ThumbsUp className="h-5 w-5 text-green-500" />,
  "verimlilik_rozeti": <RefreshCw className="h-5 w-5 text-purple-500" />,
  "ekip_rozeti": <Users className="h-5 w-5 text-orange-500" />,
  "müşteri_memnuniyeti": <Trophy className="h-5 w-5 text-yellow-500" />
};

// Rozet seviyesine göre renk belirleme
const BadgeLevelColors: Record<string, string> = {
  "bronz": "bg-amber-700 text-white",
  "gümüş": "bg-zinc-400 text-white",
  "altın": "bg-yellow-500 text-white",
  "platin": "bg-blue-400 text-white"
};

interface BadgeManagementProps {
  hotelId: number;
  currentUserId: number;
  userRole: string;
}

export default function BadgeManagement({ hotelId, currentUserId, userRole }: BadgeManagementProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<number | null>(null);
  const [badgeProgress, setBadgeProgress] = useState(0);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  // Rozet türü filtresi
  const [filterType, setFilterType] = useState<string>("all");

  // Otel kullanıcılarını çekme (hotelId=0 ise tüm kullanıcıları çek)
  const { 
    data: hotelUsers = [], 
    isLoading: usersLoading,
    error: usersError
  } = useQuery({
    queryKey: hotelId ? ['/api/hotels', hotelId, 'users'] : ['/api/users'],
    queryFn: async () => {
      try {
        const url = hotelId ? `/api/hotels/${hotelId}/users` : `/api/users`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Kullanıcılar alınırken bir hata oluştu");
        }
        return res.json();
      } catch (error) {
        console.error("Kullanıcılar getirilirken hata:", error);
        return [];
      }
    },
  });

  // Tüm rozet türlerini çekme
  const { 
    data: allBadges = [], 
    isLoading: badgesLoading,
    error: badgesError
  } = useQuery({
    queryKey: ['/api/badges'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/badges');
        if (!res.ok) {
          throw new Error("Rozet tipleri alınırken bir hata oluştu");
        }
        return res.json();
      } catch (error) {
        console.error("Rozetler getirilirken hata:", error);
        return [];
      }
    },
  });

  // Seçili kullanıcının rozetlerini çekme
  const { 
    data: userBadges = [],
    isLoading: userBadgesLoading,
    error: userBadgesError,
  } = useQuery({
    queryKey: ['/api/users', selectedUserId, 'badges'],
    queryFn: async () => {
      if (!selectedUserId) return [];
      try {
        const res = await fetch(`/api/users/${selectedUserId}/badges`);
        if (!res.ok) {
          throw new Error("Kullanıcı rozetleri alınırken bir hata oluştu");
        }
        return res.json();
      } catch (error) {
        console.error(`${selectedUserId} ID'li kullanıcının rozetleri getirilirken hata:`, error);
        return [];
      }
    },
    enabled: !!selectedUserId,
  });

  // Rozet ekleme işlemi
  const assignBadgeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !selectedBadgeId) {
        throw new Error("Kullanıcı veya rozet seçilmedi");
      }
      
      const res = await apiRequest("POST", `/api/users/${selectedUserId}/badges`, { 
        badgeId: selectedBadgeId, 
        progress: badgeProgress 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', selectedUserId, 'badges'] });
      setIsAssignDialogOpen(false);
      toast({
        title: "Rozet atandı",
        description: "Kullanıcıya başarıyla rozet atandı.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rozet atama başarısız",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Rozet kazanma uygunluğunu kontrol etme işlemi
  const checkEligibilityMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/badges/check-eligibility`);
      return res.json();
    },
    onSuccess: (data, userId) => {
      if (userId === selectedUserId) {
        queryClient.setQueryData(['/api/users', userId, 'badges'], data);
      }
      toast({
        title: "Rozet kontrolü tamamlandı",
        description: "Kullanıcının rozet kazanma durumu kontrol edildi.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rozet kontrolü başarısız",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Tip ve arama sorgusuna göre kullanıcıları filtreleme
  const filteredUsers = hotelUsers.filter((user: any) => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
    const username = (user.username || '').toLowerCase();
    const searchLower = searchQuery.toLowerCase();
    
    return (fullName.includes(searchLower) || username.includes(searchLower));
  });

  // Türe göre rozet filtreleme
  const filteredBadges = allBadges.filter((badge: any) => {
    if (filterType === "all") return true;
    return badge.type === filterType;
  });

  // Kullanıcının sahip olduğu bir rozet mi kontrol et
  const userHasBadge = (badgeId: number) => {
    return userBadges.some((ub: any) => ub.badgeId === badgeId);
  };

  // Rozet için ikon ve seviye rengi
  const getBadgeIcon = (type: string) => BadgeIcons[type] || <Award className="h-5 w-5" />;
  const getBadgeLevelClass = (level: string) => BadgeLevelColors[level] || "bg-gray-200 text-gray-700";

  // Kullanıcı için tam ad oluştur
  const getFullName = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      return user.firstName;
    } else if (user.username) {
      return user.username;
    } else {
      return "İsimsiz Kullanıcı";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Rozet Yönetimi</h2>
          <p className="text-muted-foreground">Oteldeki personele rozet atayın ve rozetleri yönetin</p>
        </div>
      </div>
      
      <Separator />
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Kullanıcılar
          </TabsTrigger>
          <TabsTrigger value="badges">
            <Award className="h-4 w-4 mr-2" />
            Rozetler
          </TabsTrigger>
        </TabsList>
        
        {/* Kullanıcılar Sekmesi */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Personel Listesi</CardTitle>
                  <CardDescription>
                    Otelinizdeki kullanıcıları ve rozetleri görüntüleyin
                  </CardDescription>
                </div>
                
                <div className="flex relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="search" 
                    placeholder="Personel ara..." 
                    className="pl-8 w-full md:w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Arama kriterine uygun personel bulunamadı." : "Henüz personel eklenmemiş."}
                </div>
              ) : (
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad Soyad</TableHead>
                        <TableHead>Departman</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Rozetler</TableHead>
                        <TableHead className="text-right">İşlemler</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user: any) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{getFullName(user)}</TableCell>
                          <TableCell>{user.department || "Belirtilmemiş"}</TableCell>
                          <TableCell>
                            {user.role === "superadmin" ? "Süper Yönetici" : 
                             user.role === "admin" ? "Yönetici" : "Personel"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <Award className="h-4 w-4 mr-2" />
                              Rozetleri Gör
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  setIsAssignDialogOpen(true);
                                }}
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  checkEligibilityMutation.mutate(user.id);
                                }}
                                disabled={checkEligibilityMutation.isPending}
                              >
                                {checkEligibilityMutation.isPending && selectedUserId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <BadgeCheck className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          
          {selectedUserId && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {hotelUsers.find((u: any) => u.id === selectedUserId) ? 
                    getFullName(hotelUsers.find((u: any) => u.id === selectedUserId)) : 
                    "Kullanıcı"} - Rozetleri
                </CardTitle>
                <CardDescription>
                  Kullanıcının sahip olduğu ve ilerlediği rozetler
                </CardDescription>
              </CardHeader>
              <CardContent>
                {userBadgesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : userBadges.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Bu kullanıcının henüz rozeti bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {userBadges.map((userBadge: any) => (
                      <Card key={`${userBadge.userId}-${userBadge.badgeId}`} className="overflow-hidden border-2 transition-all">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base">{userBadge.badge.name}</CardTitle>
                              <CardDescription className="text-xs">{userBadge.badge.description}</CardDescription>
                            </div>
                            <Badge variant="outline" className={cn("ml-2", getBadgeLevelClass(userBadge.badge.level))}>
                              {userBadge.badge.level}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "rounded-full p-2",
                              userBadge.progress >= userBadge.badge.pointsRequired ? "bg-green-100" : "bg-gray-100"
                            )}>
                              {getBadgeIcon(userBadge.badge.type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>{userBadge.progress} / {userBadge.badge.pointsRequired} puan</span>
                                <span>{Math.min(100, Math.round((userBadge.progress / userBadge.badge.pointsRequired) * 100))}%</span>
                              </div>
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-primary h-full" 
                                  style={{ width: `${Math.min(100, Math.round((userBadge.progress / userBadge.badge.pointsRequired) * 100))}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Rozetler Sekmesi */}
        <TabsContent value="badges" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <CardTitle>Mevcut Rozetler</CardTitle>
                  <CardDescription>
                    Sistemdeki tüm rozet türleri ve seviyeleri
                  </CardDescription>
                </div>
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Rozet türü seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Rozetler</SelectItem>
                    <SelectItem value="hız_rozeti">Hız Rozetleri</SelectItem>
                    <SelectItem value="kalite_rozeti">Kalite Rozetleri</SelectItem>
                    <SelectItem value="verimlilik_rozeti">Verimlilik Rozetleri</SelectItem>
                    <SelectItem value="ekip_rozeti">Ekip Rozetleri</SelectItem>
                    <SelectItem value="müşteri_memnuniyeti">Müşteri Memnuniyeti</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {badgesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredBadges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {filterType !== "all" ? "Bu türde rozet bulunamadı." : "Henüz rozet eklenmemiş."}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredBadges.map((badge: any) => (
                    <Card key={badge.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-base">{badge.name}</CardTitle>
                          <Badge variant="outline" className={cn(getBadgeLevelClass(badge.level))}>
                            {badge.level}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs line-clamp-2">{badge.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="pb-2 pt-1">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 rounded-full p-2">
                            {getBadgeIcon(badge.type)}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{badge.pointsRequired} puan gerekli</p>
                            <p className="text-xs font-medium">
                              {badge.type === "hız_rozeti" ? "Hız Rozeti" : 
                               badge.type === "kalite_rozeti" ? "Kalite Rozeti" : 
                               badge.type === "verimlilik_rozeti" ? "Verimlilik Rozeti" : 
                               badge.type === "ekip_rozeti" ? "Ekip Rozeti" : 
                               badge.type === "müşteri_memnuniyeti" ? "Müşteri Memnuniyeti" : 
                               badge.type}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setSelectedBadgeId(badge.id);
                            setBadgeProgress(badge.pointsRequired);
                            setIsAssignDialogOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Personele Ata
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Rozet Atama Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rozet Ata</DialogTitle>
            <DialogDescription>
              Seçili personele rozet atayın veya bir kullanıcı ve rozet seçin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Kullanıcı Seçimi */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="selected-user" className="text-right">
                Personel
              </Label>
              <Select 
                value={selectedUserId?.toString() || ""} 
                onValueChange={(value) => setSelectedUserId(parseInt(value))}
              >
                <SelectTrigger id="selected-user" className="col-span-3">
                  <SelectValue placeholder="Personel seçin" />
                </SelectTrigger>
                <SelectContent>
                  {hotelUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {getFullName(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Rozet Seçimi */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="selected-badge" className="text-right">
                Rozet
              </Label>
              <Select 
                value={selectedBadgeId?.toString() || ""} 
                onValueChange={(value) => setSelectedBadgeId(parseInt(value))}
              >
                <SelectTrigger id="selected-badge" className="col-span-3">
                  <SelectValue placeholder="Rozet seçin" />
                </SelectTrigger>
                <SelectContent>
                  {allBadges.map((badge: any) => (
                    <SelectItem key={badge.id} value={badge.id.toString()}>
                      <div className="flex items-center gap-2">
                        {getBadgeIcon(badge.type)}
                        <span>{badge.name}</span>
                        <Badge variant="outline" className={getBadgeLevelClass(badge.level)}>
                          {badge.level}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* İlerleme Puanı */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="badge-progress" className="text-right">
                İlerleme Puanı
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="badge-progress"
                  type="number"
                  value={badgeProgress}
                  onChange={(e) => setBadgeProgress(parseInt(e.target.value) || 0)}
                  min={0}
                  max={selectedBadgeId ? 
                    allBadges.find((b: any) => b.id === selectedBadgeId)?.pointsRequired * 2 : 
                    1000
                  }
                />
                {selectedBadgeId && (
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    / {allBadges.find((b: any) => b.id === selectedBadgeId)?.pointsRequired || 0} (gerekli)
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              İptal
            </Button>
            <Button 
              onClick={() => assignBadgeMutation.mutate()}
              disabled={assignBadgeMutation.isPending || !selectedUserId || !selectedBadgeId}
            >
              {assignBadgeMutation.isPending ? "Atanıyor..." : "Rozeti Ata"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}