import React, { useState, useEffect } from "react";
import { FrownPlus } from "@/components/icons/FrownPlus";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  SmilePlus, 
  Smile, 
  Meh, 
  Frown,
  User,
  Calendar,
  BarChart3,
  Filter
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";

interface MoodEntry {
  id: number;
  userId: number;
  hotelId: number;
  mood: string;
  comment: string | null;
  date: string;
  createdAt: string;
  user?: {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
  };
}

interface MoodStat {
  mood: string;
  count: number;
}

interface MoodBoardProps {
  userId: number;
  hotelId: number;
  userRole: string;
}

// Duygu türlerine göre emoji bileşenleri
const MoodEmoji = ({ mood, size = 24 }: { mood: string; size?: number }) => {
  switch (mood) {
    case "çok mutlu":
      return <SmilePlus size={size} className="text-green-500" />;
    case "mutlu":
      return <Smile size={size} className="text-emerald-400" />;
    case "nötr":
      return <Meh size={size} className="text-blue-400" />;
    case "üzgün":
      return <Frown size={size} className="text-amber-400" />;
    case "çok üzgün":
      return <FrownPlus size={size} className="text-red-500" />;
    default:
      return <Meh size={size} className="text-gray-400" />;
  }
};

// Duygu durumu renkleri (grafik için)
const MOOD_COLORS = {
  "çok mutlu": "#22c55e", // green-500
  "mutlu": "#34d399",     // emerald-400
  "nötr": "#60a5fa",      // blue-400
  "üzgün": "#fbbf24",     // amber-400
  "çok üzgün": "#ef4444"  // red-500
};

// Türkçe duygu durumu adları
const MOOD_NAMES = [
  { value: "çok mutlu", label: "Çok Mutlu" },
  { value: "mutlu", label: "Mutlu" },
  { value: "nötr", label: "Nötr" },
  { value: "üzgün", label: "Üzgün" },
  { value: "çok üzgün", label: "Çok Üzgün" }
];

export default function MoodBoard({ userId, hotelId, userRole }: MoodBoardProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedMood, setSelectedMood] = useState<string>("nötr");
  const [comment, setComment] = useState<string>("");
  const [activeTab, setActiveTab] = useState("my-mood");
  const [dateRange, setDateRange] = useState<{
    startDate: Date | undefined;
    endDate: Date | undefined;
  }>({
    startDate: undefined,
    endDate: undefined
  });

  // Kullanıcının kendi duygu durumu kayıtlarını getir
  const { data: userMoodEntries = [], isLoading: isLoadingUserMood } = useQuery({
    queryKey: [`/api/users/${userId}/mood-entries`],
    enabled: !!userId
  });

  // Kullanıcının bugünkü duygu durumunu getir
  const { data: todayMood, isLoading: isLoadingTodayMood } = useQuery({
    queryKey: [`/api/users/${userId}/mood-entries/${new Date().toISOString().split("T")[0]}`],
    enabled: !!userId,
    retry: false, // 404 gelirse tekrar deneme
  });

  // Otel duygu durumu kayıtlarını getir (sadece yöneticiler için)
  const { data: hotelMoodEntries = [], isLoading: isLoadingHotelMood } = useQuery({
    queryKey: [`/api/hotels/${hotelId}/mood-entries`],
    enabled: !!hotelId && (userRole === "admin" || userRole === "superadmin")
  });

  // Otel duygu durumu istatistiklerini getir (sadece yöneticiler için)
  const { data: moodStats = [], isLoading: isLoadingStats, refetch: refetchMoodStats } = useQuery({
    queryKey: [
      `/api/hotels/${hotelId}/mood-stats`
    ],
    enabled: !!hotelId && (userRole === "admin" || userRole === "superadmin"),
    queryFn: async () => {
      let url = `/api/hotels/${hotelId}/mood-stats`;
      const params = new URLSearchParams();
      
      if (dateRange.startDate) {
        params.append('startDate', dateRange.startDate.toISOString());
      }
      
      if (dateRange.endDate) {
        params.append('endDate', dateRange.endDate.toISOString());
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      console.log("Fetching mood stats with URL:", url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch mood statistics');
      }
      return response.json();
    }
  });

  // Duygu durumu gönder
  const submitMoodMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        userId,
        hotelId,
        mood: selectedMood,
        comment: comment.trim() || null,
        date: selectedDate?.toISOString() || new Date().toISOString()
      };
      
      return await apiRequest("POST", "/api/mood-entries", payload);
    },
    onSuccess: () => {
      toast({
        title: "Duygu durumunuz kaydedildi",
        description: "Duygu durumunuz başarıyla kaydedildi.",
        variant: "default"
      });
      
      // Formu temizle
      setComment("");
      
      // Önbelleği yenile
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/mood-entries`] });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/users/${userId}/mood-entries/${selectedDate?.toISOString().split("T")[0]}`]
      });
      
      if (userRole === "admin" || userRole === "superadmin") {
        queryClient.invalidateQueries({ queryKey: [`/api/hotels/${hotelId}/mood-entries`] });
        queryClient.invalidateQueries({ queryKey: [`/api/hotels/${hotelId}/mood-stats`] });
      }
    },
    onError: (error) => {
      toast({
        title: "Hata",
        description: "Duygu durumunuz kaydedilirken bir hata oluştu. Bugün için zaten bir kayıt oluşturmuş olabilirsiniz.",
        variant: "destructive"
      });
    }
  });

  // Seçilen tarih için duygu durumu zaten girilmiş mi kontrol et
  const isEntryExistsForSelectedDate = Array.isArray(userMoodEntries) && userMoodEntries.some(entry => {
    if (!entry || !entry.date || !selectedDate) return false;
    const entryDate = new Date(entry.date).toISOString().split('T')[0];
    const checkDate = selectedDate.toISOString().split('T')[0];
    return entryDate === checkDate;
  });

  // Günlük duygu durumu giriş kontrolü
  const canSubmitMood = !isEntryExistsForSelectedDate;
  
  // Todayentry değişkeni compatibility için
  const hasTodayEntry = isEntryExistsForSelectedDate;

  // Duygu durumu gönderme işlevi
  const handleSubmitMood = () => {
    if (!selectedMood) {
      toast({
        title: "Eksik bilgi",
        description: "Lütfen bir duygu durumu seçin",
        variant: "destructive"
      });
      return;
    }
    
    submitMoodMutation.mutate();
  };

  // Tarih aralığını filtrele
  const handleFilterDateRange = () => {
    // Doğrudan refetch çağırarak mevcut tarih parametreleriyle sorguyu yeniden çalıştır
    console.log("Filtering with date range:", {
      startDate: dateRange.startDate?.toISOString(),
      endDate: dateRange.endDate?.toISOString()
    });
    refetchMoodStats();
  };

  // Tarih aralığını temizle
  const clearDateRange = () => {
    setDateRange({
      startDate: undefined,
      endDate: undefined
    });
    
    // Temizledikten sonra durumu beklememek için kısa bir gecikmeyle refetch çağır
    setTimeout(() => {
      console.log("Clearing date range and refetching");
      refetchMoodStats();
    }, 100);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="my-mood" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my-mood">
            <User className="h-4 w-4 mr-2" />
            Duygu Durumum
          </TabsTrigger>
          {(userRole === "admin" || userRole === "superadmin") && (
            <>
              <TabsTrigger value="hotel-mood">
                <Calendar className="h-4 w-4 mr-2" />
                Otel Duygu Durumu
              </TabsTrigger>
              <TabsTrigger value="statistics">
                <BarChart3 className="h-4 w-4 mr-2" />
                İstatistikler
              </TabsTrigger>
            </>
          )}
        </TabsList>
        
        {/* Kullanıcının kendi duygu durumu sekmesi */}
        <TabsContent value="my-mood" className="space-y-4 pt-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Duygu Durumunuzu Paylaşın</CardTitle>
                <CardDescription>
                  Bugün nasıl hissediyorsunuz? Düşüncelerinizi paylaşın.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tarih</label>
                  <DatePicker
                    date={selectedDate}
                    setDate={setSelectedDate}
                    disabled={submitMoodMutation.isPending}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Duygu Durumunuz</label>
                  <Select 
                    defaultValue={selectedMood}
                    onValueChange={setSelectedMood}
                    disabled={submitMoodMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Duygu durumunuzu seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOOD_NAMES.map((mood) => (
                        <SelectItem key={mood.value} value={mood.value}>
                          <div className="flex items-center">
                            <MoodEmoji mood={mood.value} size={18} />
                            <span className="ml-2">{mood.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Yorumunuz (İsteğe bağlı)</label>
                  <Textarea
                    placeholder="Bugün neler oldu? Nasıl hissediyorsunuz?"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={submitMoodMutation.isPending}
                    className="min-h-[120px]"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDate(new Date());
                    setSelectedMood("nötr");
                    setComment("");
                  }}
                  disabled={submitMoodMutation.isPending}
                >
                  Temizle
                </Button>
                <Button
                  onClick={handleSubmitMood}
                  disabled={submitMoodMutation.isPending || !canSubmitMood}
                >
                  {submitMoodMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </CardFooter>
              {!canSubmitMood && (
                <div className="px-6 pb-4 text-sm text-amber-600">
                  Bu tarih için zaten bir duygu durumu girişi yapılmış.
                </div>
              )}
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Duygu Durumu Geçmişim</CardTitle>
                <CardDescription>
                  Geçmiş duygu durumu kayıtlarınız
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUserMood ? (
                  <div className="text-center py-4">Yükleniyor...</div>
                ) : !userMoodEntries || userMoodEntries.length === 0 ? (
                  <div className="text-center py-4">
                    Henüz duygu durumu kaydınız bulunmuyor
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {userMoodEntries.map((entry: MoodEntry) => (
                      <div key={entry.id} className="border p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <MoodEmoji mood={entry.mood} />
                            <span className="font-medium">
                              {MOOD_NAMES.find(m => m.value === entry.mood)?.label}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        {entry.comment && (
                          <div className="mt-2 text-sm">{entry.comment}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Otel duygu durumu sekmesi - sadece admin kullanıcılar için */}
        {(userRole === "admin" || userRole === "superadmin") && (
          <TabsContent value="hotel-mood" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Otel Personeli Duygu Durumu</CardTitle>
                <CardDescription>
                  Tüm personelin duygu durumu kayıtları
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHotelMood ? (
                  <div className="text-center py-4">Yükleniyor...</div>
                ) : !hotelMoodEntries || hotelMoodEntries.length === 0 ? (
                  <div className="text-center py-4">
                    Henüz duygu durumu kaydı bulunmuyor
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {hotelMoodEntries.map((entry: MoodEntry) => (
                      <div key={entry.id} className="border p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <MoodEmoji mood={entry.mood} />
                            <span className="font-medium">
                              {MOOD_NAMES.find(m => m.value === entry.mood)?.label}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {entry.user?.firstName} {entry.user?.lastName}
                        </div>
                        {entry.comment && (
                          <div className="mt-2 text-sm">{entry.comment}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
        
        {/* İstatistikler sekmesi - sadece admin kullanıcılar için */}
        {(userRole === "admin" || userRole === "superadmin") && (
          <TabsContent value="statistics" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Duygu Durumu İstatistikleri</CardTitle>
                <CardDescription>
                  Personelin duygu durumu dağılımı
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col md:flex-row items-start md:items-end gap-4">
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-sm font-medium">Başlangıç Tarihi</label>
                    <DatePicker
                      date={dateRange.startDate}
                      setDate={(date) => setDateRange(prev => ({ ...prev, startDate: date }))}
                    />
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-sm font-medium">Bitiş Tarihi</label>
                    <DatePicker
                      date={dateRange.endDate}
                      setDate={(date) => setDateRange(prev => ({ ...prev, endDate: date }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={clearDateRange}
                      className="flex-shrink-0"
                    >
                      Temizle
                    </Button>
                    <Button 
                      onClick={handleFilterDateRange} 
                      className="flex items-center gap-2 flex-shrink-0"
                    >
                      <Filter className="h-4 w-4" />
                      Filtrele
                    </Button>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                {isLoadingStats ? (
                  <div className="text-center py-4">Yükleniyor...</div>
                ) : !moodStats || moodStats.length === 0 ? (
                  <div className="text-center py-4">
                    Bu tarih aralığında duygu durumu kaydı bulunmuyor
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={moodStats}
                          dataKey="count"
                          nameKey="mood"
                          cx="50%"
                          cy="50%"
                          outerRadius={150}
                          label={(entry) => {
                            const moodName = MOOD_NAMES.find(m => m.value === entry.mood)?.label || entry.mood;
                            return `${moodName} (${entry.count})`;
                          }}
                        >
                          {moodStats.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={MOOD_COLORS[entry.mood as keyof typeof MOOD_COLORS] || "#999"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => {
                            const moodName = MOOD_NAMES.find(m => m.value === name)?.label || name;
                            return [`${value} kişi`, moodName];
                          }}
                        />
                        <Legend
                          formatter={(value) => {
                            return MOOD_NAMES.find(m => m.value === value)?.label || value;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {MOOD_NAMES.map((mood) => (
                    <div key={mood.value} className="flex flex-col items-center">
                      <MoodEmoji mood={mood.value} size={32} />
                      <span className="text-xs mt-1">{mood.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}