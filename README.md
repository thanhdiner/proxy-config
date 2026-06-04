# Bypass Flow - Custom URL Proxy Chrome Extension

| English | Tiếng Việt |
| :--- | :--- |
| Bypass Flow is a Chrome Extension built on Manifest V3. It allows users to route specific URLs or domains through custom HTTP, HTTPS, or SOCKS5 proxies while all other traffic goes directly (DIRECT). | Bypass Flow là một tiện ích mở rộng cho Chrome được xây dựng trên Manifest V3. Tiện ích này cho phép người dùng điều tuyến các URL hoặc tên miền cụ thể qua máy chủ proxy tùy chỉnh (HTTP, HTTPS hoặc SOCKS5), trong khi toàn bộ lưu lượng truy cập khác sẽ đi trực tiếp (DIRECT). |
| This is highly useful for bypassing internet restrictions on specific websites (e.g., Medium) without proxying the entire browser. | Tiện ích này cực kỳ hữu ích để vượt tường lửa hoặc các rào cản truy cập đối với một số trang web cụ thể (ví dụ: Medium) mà không cần phải chạy proxy cho toàn bộ trình duyệt. |

---

## Technical Specifications / Thông số kỹ thuật

| Concept / Khái niệm | English Description | Mô tả Tiếng Việt |
| :--- | :--- | :--- |
| **Manifest Version** | Manifest V3 compliant. | Tuân thủ tiêu chuẩn Manifest V3 mới nhất. |
| **API Integration** | Uses `chrome.proxy` API for PAC configuration and `chrome.webRequest` for dynamic credentials authentication. | Sử dụng API `chrome.proxy` để cấu hình PAC và API `chrome.webRequest` để xử lý xác thực tài khoản động. |
| **Security** | Safe credentials management. Username and password are not hardcoded inside the PAC script and are handled dynamically in the background service worker. | Quản lý thông tin xác thực an toàn. Tên đăng nhập và mật khẩu không bị ghi đè trực tiếp trong mã PAC mà được xử lý động ở dịch vụ nền (Service Worker). |

---

## Key Features / Tính năng chính

| English | Tiếng Việt |
| :--- | :--- |
| **Dynamic PAC Generation**: Automatically compiles and applies a Proxy Auto-Config (PAC) script based on your input rules. | **Tự động tạo mã lệnh PAC**: Tự động biên dịch và áp dụng tập lệnh Proxy Auto-Config (PAC) dựa trên các quy tắc bạn nhập. |
| **Flexible Rules**: Supports exact domains (`medium.com`), wildcard subdomains (`*.medium.com`), and full URL prefixes (`https://medium.com/story/`). | **Quy tắc linh hoạt**: Hỗ trợ tên miền chính xác (`medium.com`), tên miền phụ chứa ký tự đại diện (`*.medium.com`), và tiền tố URL đầy đủ (`https://medium.com/story/`). |
| **Interactive Routing Tester**: Test any URL instantly in the popup to see if it matches your rules and gets routed through the proxy or goes direct. | **Bộ kiểm tra tuyến trực quan**: Kiểm tra nhanh bất kỳ URL nào ngay tại giao diện popup để biết URL đó sẽ đi qua proxy hay đi trực tiếp. |
| **Sleek Interface**: Modern dark-mode UI with glassmorphic elements and clean state indicators. | **Giao diện hiện đại**: Thiết kế tối màu (dark-mode) sang trọng với các hiệu ứng kính mờ (glassmorphism) và chỉ báo trạng thái rõ ràng. |

---

## File Structure / Cấu trúc thư mục

| File Name / Tên tệp | Purpose / Mục đích |
| :--- | :--- |
| **[manifest.json](file:///f:/All%20Project/proxy-config/manifest.json)** | Extension configuration, declarations, and permissions. / Khai báo cấu hình, tài nguyên và quyền truy cập của tiện ích. |
| **[background.js](file:///f:/All%20Project/proxy-config/background.js)** | Service worker handling storage changes, PAC updates, and credentials authentication. / Dịch vụ nền quản lý thay đổi dữ liệu, cập nhật PAC và xác thực tài khoản proxy. |
| **[popup.html](file:///f:/All%20Project/proxy-config/popup.html)** | Structure for the popup settings panel and test tool. / Bộ khung giao diện bảng cấu hình và công cụ kiểm tra tuyến đường. |
| **[popup.css](file:///f:/All%20Project/proxy-config/popup.css)** | Glassmorphic visual styles, animations, and typography. / Phong cách thiết kế kính mờ, hiệu ứng chuyển động và phông chữ. |
| **[popup.js](file:///f:/All%20Project/proxy-config/popup.js)** | UI interactions, settings saving, and local routing simulator logic. / Xử lý tương tác giao diện, lưu trữ cấu hình và thuật toán mô phỏng tuyến đường. |
| **[icons/](file:///f:/All%20Project/proxy-config/icons/)** | Directory containing icon files (16x16, 48x48, 128x128). / Thư mục chứa các tệp ảnh biểu tượng tiện ích. |

---

## Installation Guide / Hướng dẫn cài đặt

| Step / Bước | English Instructions | Hướng dẫn Tiếng Việt |
| :--- | :--- | :--- |
| **1** | Download or clone this repository to your local machine. | Tải về hoặc sao chép mã nguồn của kho lưu trữ này về máy tính cá nhân. |
| **2** | Open Google Chrome and go to `chrome://extensions/`. | Mở trình duyệt Google Chrome và truy cập đường dẫn `chrome://extensions/`. |
| **3** | Turn on the **Developer mode** toggle in the top-right corner. | Bật công tắc **Chế độ nhà phát triển** (Developer mode) ở góc trên cùng bên phải. |
| **4** | Click the **Load unpacked** button in the top-left corner. | Nhấp vào nút **Tải tiện ích đã giải nén** (Load unpacked) ở góc trên cùng bên trái. |
| **5** | Select the `proxy-config` directory. | Chọn thư mục cài đặt `proxy-config` chứa mã nguồn. |

---

## How to Use / Hướng dẫn sử dụng

| English Steps | Hướng dẫn Tiếng Việt từng bước |
| :--- | :--- |
| 1. Click the Bypass Flow icon in the toolbar. | 1. Nhấp vào biểu tượng Bypass Flow trên thanh công cụ của trình duyệt. |
| 2. Choose the Proxy Protocol (HTTP, HTTPS, SOCKS5). | 2. Chọn Giao thức máy chủ proxy thích hợp (HTTP, HTTPS, SOCKS5). |
| 3. Input the Server Host and Port. | 3. Điền địa chỉ máy chủ (Host) và Cổng kết nối (Port). |
| 4. (Optional) Toggle "Authentication" to fill in the Username and Password if your proxy requires them. | 4. (Tùy chọn) Nhấp mở rộng "Authentication" để nhập tên tài khoản và mật khẩu nếu proxy yêu cầu xác thực. |
| 5. Enter your routing rules in the rules box (one pattern per line, e.g., `medium.com`). | 5. Nhập các quy tắc định tuyến của bạn vào ô quy tắc (mỗi định dạng nằm trên một dòng riêng biệt, ví dụ: `medium.com`). |
| 6. Toggle the switch at the top to enable the extension. | 6. Gạt công tắc ở đầu giao diện để chuyển trạng thái kích hoạt hoạt động. |
| 7. Click **Save & Apply Configuration** to save your configurations and reload the proxy settings. | 7. Nhấn **Save & Apply Configuration** để lưu trữ cấu hình đồng thời biên dịch lại tệp lệnh định tuyến PAC. |
