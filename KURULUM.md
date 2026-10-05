# Dino Rush — telefona kurulum (TestFlight)

Jarvis'te yaptığımızın aynısı. Sadece 4 adım, bir kere yapılır.

## 1. Apple'da kimlik aç (2 dk)
1. **developer.apple.com/account** → **Certificates, IDs & Profiles** → **Identifiers** → mavi **+**
2. **App IDs** → **App** → Continue
3. Description: `Dino Rush` · Bundle ID (Explicit): `com.emccreationsstudio.DinoRush`
4. Continue → **Register**

## 2. App Store Connect'te uygulamayı aç (2 dk)
1. **appstoreconnect.apple.com** → **Uygulamalar** → **+** → **Yeni Uygulama**
2. Platform: **iOS** · Ad: `Dino Rush` (alınmışsa `Dino Rush: Eve Dönüş`)
3. Dil: Türkçe · Paket Kimliği: **com.emccreationsstudio.DinoRush** · SKU: `dinorush`
4. **Oluştur**

## 3. GitHub'a yükle (3 dk)
1. **github.com/new** → Repository name: `dino-rush` → **Private** → **Create repository**
2. Açılan sayfada **"uploading an existing file"** bağlantısına tıkla.
3. `DinoRush-iOS` klasörünü **aç**, içindeki her şeyi (DinoRush klasörü + 3 dosya) seçip sayfaya sürükle.
4. Yükleme bitince **Commit changes**.

## 4. Codemagic'te derle (1 kere ayar, sonra tek tık)
1. **codemagic.io** → **Add application** → GitHub → `dino-rush` deposunu seç → **Finish**
2. **Start new build** → Workflow: **Dino Rush — TestFlight** → **Start**
3. Yaklaşık 10–15 dakika sonra **TestFlight** uygulamasında **Dino Rush** çıkar → **Yükle**.

## Sonra güncellerken
Değişen dosyaları GitHub'a yükle → Codemagic'te **Start new build**. Telefondaki TestFlight kendini günceller.

## Notlar
- Oyun internetsiz çalışır (her şey uygulamanın içinde).
- İlerleme (açılan dinozorlar, yıldızlar) telefonda saklanır.
- Şimdilik yalnızca iPhone, dikey. iPad sonraki adımda.
