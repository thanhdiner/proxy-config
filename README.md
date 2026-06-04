# Bypass Flow - Custom URL Proxy Chrome Extension

Bypass Flow la mot Chrome Extension duoc xay dung tren Manifest V3, cho phep nguoi dung cau hinh proxy tuy chon (HTTP, HTTPS, SOCKS5) de truy cap cac URL hoac ten mien cu the, trong khi cac luu luong truy cap khac van duy tri ket noi truc tiep (DIRECT).

Chuc nang nay rat huu ich khi ban can vuot qua cac bo chan truy cap noi bo hoac nha mang doi voi mot so trang web nhat dinh (vi du: Medium) ma khong muon thay doi proxy cho toan bo trinh duyet.

## Tinh nang chinh

- Su dung PAC (Proxy Auto-Config) script dong de tu dong phan tuyen luu luong.
- Cau hinh proxy rieng le cho tung ten mien, ten mien phu (wildcard subdomain) hoac URL prefix.
- Ho tro xac thuc proxy (Username/Password) thong qua API `chrome.webRequest.onAuthRequired` ma khong lo tai khoan trong ma nguon PAC script.
- Giao dien nguoi dung hien dai, ho tro cong cu gia lap kiem tra quy tac tuyen duong nhanh ngay tren popup.

## Danh sach file trong du an

- manifest.json: Khai bao thong tin cau hinh, quyen truy cap va file nen.
- background.js: Tu dong tao PAC script, ap dung cau hinh va xu ly xac thuc proxy bat dong bo.
- popup.html: Cau truc giao dien popup de nhap cau hinh va danh sach ten mien.
- popup.css: Thiet ke giao dien dark mode hien dai voi cac hieu ung glassmorphism.
- popup.js: Xu ly cac su kien tren giao dien, luu tru du lieu vao local storage va gia lap kiem tra duong truyen.
- icons/: Thu muc chua cac bieu tuong cua extension o cac kich thuoc 16x16, 48x48 va 128x128 pixel.

## Huong dan cai dat

1. Tai va giai nen ma nguon cua extension ve may.
2. Mo trinh duyet Google Chrome va truy cap vao duong dan: chrome://extensions/
3. Bat che do cho nha phat trien (Developer mode) o goc tren cung ben phai trinh duyet.
4. Nhan vao nut "Load unpacked" (Tai tien ich da giai nen) o goc tren cung ben trai.
5. Chon thu muc "proxy-config" chua ma nguon cua tien ich nay.

## Huong dan su dung

1. Click vao bieu tuong cua extension Bypass Flow tren thanh cong cu Chrome.
2. Dien cac thong tin proxy cua ban bao gom:
   - Server Protocol (HTTP, HTTPS, SOCKS5).
   - Server Host / IP (Ten mien hoac IP cua proxy).
   - Port (Cong cua proxy).
3. (Tuy chon) Click vao muc "Authentication" de nhap Username va Password neu proxy cua ban yeu cau xac thuc.
4. Nhap cac quy tac bo loc trong o "Bypass Rules" (moi quy tac tren mot dong), vi du:
   - medium.com: Ap dung cho medium.com va tat ca cac ten mien phu nhu sub.medium.com.
   - *.medium.com: Ap dung rieng cho tat ca cac ten mien phu cua medium.com (khong bao gom chinh no).
   - https://medium.com/story/: Ap dung cho cac URL co tien to dung giong nhu tren.
5. Bat cong tac hoat dong cua extension o phan header.
6. Nhan nut "Save & Apply Configuration" de luu va kich hoat cau hinh.

## Kiem tra tuyen duong truc quan

Extension tich hop san mot o nhap URL kiem tra phia cuoi popup:
- Nhap URL ban muon kiem tra (vi du: https://medium.com/p/123).
- Nhan nut "Test".
- Giao dien se hien thi nhan "PROXY" kem theo quy tac phu hop neu URL di qua proxy, hoac hien thi nhan "DIRECT" neu di qua mang thuong.
