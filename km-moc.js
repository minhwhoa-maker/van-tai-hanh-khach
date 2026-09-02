// km-moc.js — tính km tích lũy (km_moc) của 1 điểm giao trên tuyến chuẩn Đắk Lắk -> Hải Dương,
// và sắp xếp thứ tự kiện trong cùng 1 tỉnh theo km_moc. Dữ liệu tuyến nạp qua fetch (KHÔNG
// nhúng vào file này) — xem data/tuyen_chuan_bactien.json và data/tinh_km_range.json.
// Yêu cầu: load trước manifest-hang.html script.

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
}

// Giới hạn tìm kiếm theo tinh_ma đã biết trước (từ diem.tinh_ma) — tránh nearest-neighbor
// nhảy nhầm sang đoạn tuyến khác xa hàng trăm km (đèo, khúc cua, vòng qua thành phố).
function tinhKmMoc(lat, lng, tinhMa, tuyenChuan, tinhKmRange) {
    const range = tinhKmRange[tinhMa]
    if (!range) return null
    const candidates = tuyenChuan.filter(p => p.km >= range.km_min && p.km <= range.km_max)
    let best = null, bestDist = Infinity
    for (const p of candidates) {
        const d = haversineKm(lat, lng, p.lat, p.lng)
        if (d < bestDist) { bestDist = d; best = p }
    }
    return best ? best.km : null
}

// Sắp xếp danh sách kiện trong cùng 1 tỉnh theo km_moc của điểm giao.
// null luôn xuống cuối, bất kể chiều — xử lý tường minh, không phụ thuộc mặc định
// NULLS FIRST/LAST của Postgres (đã gây bẫy khi lật dấu ASC/DESC ở bản nháp trước).
function sapXepTrongTinh(dsKien, chieu) {
    return dsKien.sort((a, b) => {
        const kmA = a.diem?.km_moc, kmB = b.diem?.km_moc
        if (kmA == null && kmB == null) return 0
        if (kmA == null) return 1
        if (kmB == null) return -1
        return chieu === 'bac' ? kmA - kmB : kmB - kmA
    })
}

// Nạp 2 file dữ liệu tuyến 1 lần, cache trong bộ nhớ cho các lần gọi sau trong cùng phiên trang.
let _tuyenChuanCache = null
let _tinhKmRangeCache = null
async function loadTuyenChuanData() {
    if (_tuyenChuanCache && _tinhKmRangeCache) {
        return { tuyenChuan: _tuyenChuanCache, tinhKmRange: _tinhKmRangeCache }
    }
    const [tuyenRes, rangeRes] = await Promise.all([
        fetch('data/tuyen_chuan_bactien.json'),
        fetch('data/tinh_km_range.json')
    ])
    _tuyenChuanCache = await tuyenRes.json()
    _tinhKmRangeCache = await rangeRes.json()
    return { tuyenChuan: _tuyenChuanCache, tinhKmRange: _tinhKmRangeCache }
}

// Bắt GPS 1 lần, không throw — trả về null nếu từ chối quyền/lỗi/timeout thay vì reject,
// để không chặn luồng "Đã giao" chính. Chạy được offline (chip GPS không cần mạng).
function batGpsDiemGiao(timeoutMs = 15000) {
    return new Promise(resolve => {
        if (!navigator.geolocation) { resolve(null); return }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
        )
    })
}
