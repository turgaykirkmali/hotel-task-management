import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  Trophy, 
  Award, 
  Clock, 
  Users, 
  ThumbsUp,
  RefreshCw,
  BadgeCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

// Rozet türüne göre ikon belirleme
const BadgeIcons: Record<string, React.ReactNode> = {
  "hız_rozeti": <Clock className="h-10 w-10 text-blue-500" />,
  "kalite_rozeti": <ThumbsUp className="h-10 w-10 text-green-500" />,
  "verimlilik_rozeti": <RefreshCw className="h-10 w-10 text-purple-500" />,
  "ekip_rozeti": <Users className="h-10 w-10 text-orange-500" />,
  "müşteri_memnuniyeti": <Trophy className="h-10 w-10 text-yellow-500" />
};

// Rozet seviyesine göre renk belirleme
const BadgeLevelColors: Record<string, string> = {
  "bronz": "bg-amber-700 text-white",
  "gümüş": "bg-zinc-400 text-white",
  "altın": "bg-yellow-500 text-white",
  "platin": "bg-blue-400 text-white"
};

interface BadgeProps {
  userId: number;
  userName?: string;
  userRole?: string;
}

// Ana rozet bileşeni
export default function Badges({ userId, userName, userRole }: BadgeProps) {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("all");

  // Kullanıcı rozetlerini çekme
  const { 
    data: userBadges, 
    isLoading: badgesLoading, 
    error: badgesError 
  } = useQuery({
    queryKey: ['/api/users', userId, 'badges'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/badges`);
      if (!res.ok) {
        throw new Error("Rozetler alınırken bir hata oluştu");
      }
      return res.json();
    },
    staleTime: 30000, // 30 saniye boyunca güncel kabul et
  });

  // Tüm rozet türlerini çekme
  const { 
    data: allBadges, 
    isLoading: allBadgesLoading, 
    error: allBadgesError 
  } = useQuery({
    queryKey: ['/api/badges'],
    queryFn: async () => {
      const res = await fetch('/api/badges');
      if (!res.ok) {
        throw new Error("Rozet tipleri alınırken bir hata oluştu");
      }
      return res.json();
    },
    staleTime: 60000, // 1 dakika boyunca güncel kabul et
  });

  // Rozet kazanma uygunluğunu kontrol etme işlemi
  const checkEligibilityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${userId}/badges/check-eligibility`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/users', userId, 'badges'], data);
      toast({
        title: "Rozet kontrolü tamamlandı",
        description: "Rozet kazanma durumunuz kontrol edildi.",
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

  // Rozet ekleme işlemi (Sadece admin ve superadmin için)
  const assignBadgeMutation = useMutation({
    mutationFn: async ({ badgeId, progress }: { badgeId: number, progress: number }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/badges`, { badgeId, progress });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['/api/users', userId, 'badges']});
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

  // Hata durumlarını gösterme
  if (badgesError || allBadgesError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Hata</AlertTitle>
        <AlertDescription>
          {badgesError ? (String(badgesError)) : (String(allBadgesError))}
        </AlertDescription>
      </Alert>
    );
  }

  // Rozet tipine göre filtreleme (boş değer kontrolü ile)
  const filterBadgesByType = (badges: any[] = [], type: string) => {
    if (!badges || badges.length === 0) return [];
    if (type === "all") return badges;
    return badges.filter(badge => badge.badge?.type === type);
  };

  // Yönetici kontrolü
  const isAdmin = userRole === "admin" || userRole === "superadmin";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{userName ? `${userName} - ` : ''}Başarı Rozetleri</h2>
          <p className="text-muted-foreground">Tamamlanan görevler ve mükemmellik için kazanılan rozetler</p>
        </div>
        
        {/* Yönetici ise rozet kontrolü yapma butonu */}
        {isAdmin && (
          <Button 
            variant="outline" 
            onClick={() => checkEligibilityMutation.mutate()}
            disabled={checkEligibilityMutation.isPending}
          >
            {checkEligibilityMutation.isPending ? (
              <>Kontrol Ediliyor...</>
            ) : (
              <>
                <BadgeCheck className="mr-2 h-4 w-4" />
                Rozet Uygunluğunu Kontrol Et
              </>
            )}
          </Button>
        )}
      </div>
      
      <Separator />
      
      <Tabs defaultValue="all" value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">Tümü</TabsTrigger>
          <TabsTrigger value="hız_rozeti">Hız</TabsTrigger>
          <TabsTrigger value="kalite_rozeti">Kalite</TabsTrigger>
          <TabsTrigger value="verimlilik_rozeti">Verimlilik</TabsTrigger>
          <TabsTrigger value="ekip_rozeti">Ekip</TabsTrigger>
          <TabsTrigger value="müşteri_memnuniyeti">Müşteri Memnuniyeti</TabsTrigger>
        </TabsList>
        
        <TabsContent value={selectedTab} className="mt-2">
          {badgesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-1/2 mb-2" />
                    <Skeleton className="h-3 w-3/4" />
                  </CardHeader>
                  <CardContent className="flex justify-center py-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-4 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : userBadges && userBadges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filterBadgesByType(userBadges, selectedTab).map((userBadge: any) => (
                <BadgeCard 
                  key={`${userBadge.userId}-${userBadge.badgeId}`} 
                  userBadge={userBadge} 
                  userId={userId}
                />
              ))}
            </div>
          ) : (
            <NoBadgesView
              isAdmin={isAdmin}
              userId={userId}
              allBadges={allBadges}
              selectedType={selectedTab}
              assignBadge={(badgeId, progress) => assignBadgeMutation.mutate({ badgeId, progress })}
              isAssigning={assignBadgeMutation.isPending}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Rozet kartı bileşeni
function BadgeCard({ userBadge, userId }: { userBadge: any, userId: number }) {
  const { badge, progress } = userBadge;
  const progressPercentage = Math.min(100, Math.round((progress / badge.pointsRequired) * 100));
  const earnedPercentage = progressPercentage >= 100;
  
  const badgeIcon = BadgeIcons[badge.type] || <Award className="h-10 w-10 text-gray-500" />;
  const levelClass = BadgeLevelColors[badge.level] || "bg-gray-200 text-gray-700";
  
  return (
    <Card className={cn(
      "overflow-hidden border-2 transition-all",
      earnedPercentage ? "border-green-500 shadow-md" : "border-gray-200"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{badge.name}</CardTitle>
            <CardDescription>{badge.description}</CardDescription>
          </div>
          <Badge variant="outline" className={cn("ml-2", levelClass)}>
            {badge.level}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col items-center py-4">
        <div className={cn(
          "rounded-full p-4 mb-3 transition-all",
          earnedPercentage ? "bg-green-100" : "bg-gray-100"
        )}>
          {badgeIcon}
        </div>
        
        <div className="w-full mt-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress} / {badge.pointsRequired} puan</span>
            <span>{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardContent>
      
      <CardFooter>
        <div className="w-full flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {earnedPercentage ? "Kazanıldı" : "İlerleme devam ediyor"}
          </span>
          
          {earnedPercentage && (
            <Shield className="h-5 w-5 text-green-500" />
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

// Rozet bulunmadığında gösterilecek görünüm
function NoBadgesView({ 
  isAdmin,
  userId, 
  allBadges, 
  selectedType,
  assignBadge,
  isAssigning
}: { 
  isAdmin: boolean;
  userId: number; 
  allBadges: any[];
  selectedType: string;
  assignBadge: (badgeId: number, progress: number) => void;
  isAssigning: boolean;
}) {
  // Güvenli filtreleme (null ya da undefined allBadges durumları için)
  const allBadgesList = Array.isArray(allBadges) ? allBadges : [];
  const filteredBadges = selectedType === "all" 
    ? allBadgesList 
    : allBadgesList.filter(b => b && b.type === selectedType);
    
  return (
    <div className="text-center py-8">
      <div className="mx-auto w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-4">
        <Award className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <h3 className="text-xl font-semibold mb-2">Hiç rozet bulunamadı</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        {selectedType === "all" 
          ? "Henüz hiç rozet kazanılmamış. Görevleri tamamlayarak rozetler kazanabilirsiniz."
          : `Bu kategoride rozet bulunmuyor. ${
              selectedType === "hız_rozeti" 
                ? "Görevleri hızlı tamamlayarak" 
                : selectedType === "kalite_rozeti" 
                ? "Yüksek kaliteli iş çıkararak" 
                : selectedType === "verimlilik_rozeti" 
                ? "Verimli çalışarak" 
                : selectedType === "ekip_rozeti" 
                ? "Ekip çalışmasına katkıda bulunarak" 
                : "Müşteri memnuniyetini artırarak"
            } rozet kazanabilirsiniz.`
        }
      </p>
      
      {isAdmin && Array.isArray(allBadges) && allBadges.length > 0 && (
        <div className="mt-8 border rounded-lg p-4 max-w-2xl mx-auto">
          <h4 className="font-medium mb-4">Yönetici Kontrolleri: Rozet Atama</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredBadges.map((badge) => (
              <Button
                key={badge.id}
                variant="outline"
                className="flex flex-col h-auto p-4"
                onClick={() => assignBadge(badge.id, badge.pointsRequired)}
                disabled={isAssigning}
              >
                <div className="mb-2">
                  {BadgeIcons[badge.type] || <Award className="h-6 w-6" />}
                </div>
                <span className="text-sm">{badge.name}</span>
                <Badge className={cn("mt-1", BadgeLevelColors[badge.level] || "bg-gray-200")}>
                  {badge.level}
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}