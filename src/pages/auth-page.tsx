import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Form şemaları
const loginSchema = z.object({
  username: z.string().min(3, "Kullanıcı adı en az 3 karakter olmalıdır"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Kullanıcı adı en az 3 karakter olmalıdır"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır"),
  role: z.enum(["admin", "staff"]).default("staff"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");

  // Mevcut oturum kontrolü - localStorage'dan kontrol etme
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const [, setLocation] = useLocation();

  // Eğer kullanıcı zaten oturum açmışsa ana sayfaya yönlendir
  if (user) {
    setLocation("/");
    return null;
  }

  // Giriş formu
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Kayıt formu
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      role: "staff",
    },
  });

  // Giriş mutasyonu
  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormValues) => {
      const res = await apiRequest("POST", "/api/login", data);
      return await res.json();
    },
    onSuccess: (user) => {
      // Kullanıcı bilgilerini localStorage'a kaydet
      localStorage.setItem("user", JSON.stringify(user));
      // Kullanıcı verisini önbelleğe ekle
      queryClient.setQueryData(["/api/user"], user);

      toast({
        title: "Giriş başarılı",
        description: "Hoşgeldiniz! Yönlendiriliyorsunuz...",
      });

      // Ana sayfaya yönlendir
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Giriş başarısız",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Kayıt mutasyonu
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormValues) => {
      const res = await apiRequest("POST", "/api/register", data);
      return await res.json();
    },
    onSuccess: (user) => {
      // Kullanıcı bilgilerini localStorage'a kaydet
      localStorage.setItem("user", JSON.stringify(user));
      // Kullanıcı verisini önbelleğe ekle
      queryClient.setQueryData(["/api/user"], user);

      toast({
        title: "Kayıt başarılı",
        description: "Hoşgeldiniz! Yönlendiriliyorsunuz...",
      });

      // Ana sayfaya yönlendir
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Kayıt başarısız",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Giriş formu gönderimi
  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };

  // Kayıt formu gönderimi
  const onRegisterSubmit = (data: RegisterFormValues) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8">
        {/* Bilgi bölümü */}
        <div className="bg-primary text-white p-8 rounded-lg shadow-lg hidden md:flex md:flex-col md:justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-4">Otel İstek Sistemi</h1>
            <p className="mb-6">
              Otel personeli için iş isteklerini yönetmenin en kolay yolu. 
              Kat hizmetleri, teknik servis, resepsiyon ve diğer departmanlar için istek 
              oluşturun ve takip edin.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start space-x-2">
              <div className="bg-white/20 p-1 rounded mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm">İstekleri oluşturun, takip edin ve tamamlayın</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="bg-white/20 p-1 rounded mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm">Departman bazlı filtreleme ve atama</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="bg-white/20 p-1 rounded mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm">Detaylı raporlar ve istatistikler</p>
            </div>
          </div>
        </div>

        {/* Form bölümü */}
        <div>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-center">Otel İstek Sistemi</CardTitle>
              <CardDescription className="text-center">
                Devam etmek için giriş yapın
              </CardDescription>
            </CardHeader>

            {/* Tabs bileşeni yerine sadece login formu */}
            <CardContent className="pt-4">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kullanıcı Adı</FormLabel>
                        <FormControl>
                          <Input placeholder="kullaniciadi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Şifre</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
                  </Button>
                </form>
              </Form>
              
              <div className="mt-4 text-center text-sm text-muted-foreground">
                <p>Yeni kullanıcı kaydı şu anda devre dışıdır.</p>
                <p>Lütfen sistem yöneticinizle iletişime geçin.</p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col items-center justify-center text-sm text-gray-500 pt-0">
              <p className="mb-1">Demo uygulaması - Otel İstek Sistemi</p>
              <p>© 2025 - Tüm hakları saklıdır</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}