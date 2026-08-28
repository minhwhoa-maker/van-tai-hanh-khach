// idb-queue.js — offline write-queue cho kiện hàng, dùng IndexedDB.
// Yêu cầu: load trước shared.js/hang.html script. KHÔNG phụ thuộc thư viện ngoài.
//
// LƯU Ý SCHEMA: các field kien dưới đây (tinh_id, diem_id, mo_ta, nguoi_nhap...)
// là GIẢ ĐỊNH tạm — đối chiếu lại với eakar_hang_v1.sql khi có file thật và
// sửa insertKien() + tên bucket 'kien' cho khớp.

const IDB_NAME = 'eakar-hang'
const IDB_VERSION = 1
const STORE_KIEN = 'kien_queue'

function openQueueDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE_KIEN)) {
                db.createObjectStore(STORE_KIEN, { keyPath: 'id' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

// record: { id, tinh_id, diem_id, mo_ta, nguoi_nhap, anh_blob, created_at, da_sync }
async function queueKien(record) {
    const db = await openQueueDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_KIEN, 'readwrite')
        tx.objectStore(STORE_KIEN).put(record)
        tx.oncomplete = () => resolve(record)
        tx.onerror = () => reject(tx.error)
    })
}

async function getAllKienLocal() {
    const db = await openQueueDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_KIEN, 'readonly')
        const req = tx.objectStore(STORE_KIEN).getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
    })
}

async function getUnsyncedKien() {
    const all = await getAllKienLocal()
    return all.filter(r => !r.da_sync)
}

async function markKienSynced(id) {
    const db = await openQueueDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_KIEN, 'readwrite')
        const store = tx.objectStore(STORE_KIEN)
        const req = store.get(id)
        req.onsuccess = () => {
            const rec = req.result
            if (rec) {
                rec.da_sync = true
                store.put(rec)
            }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// Đẩy các bản ghi chưa sync lên Supabase: upload ảnh vào bucket 'kien', insert bảng 'kien'.
async function trySyncQueue(sb) {
    if (!navigator.onLine) return { synced: 0, failed: 0 }
    const pending = await getUnsyncedKien()
    let synced = 0, failed = 0

    for (const rec of pending) {
        try {
            let anh_url = null
            if (rec.anh_blob) {
                const ext = 'jpg'
                const path = `${rec.id}.${ext}`
                const { error: upErr } = await sb.storage.from('kien').upload(path, rec.anh_blob, { upsert: true })
                if (upErr) throw upErr
                const { data: pub } = sb.storage.from('kien').getPublicUrl(path)
                anh_url = pub.publicUrl
            }

            const { error: insErr } = await sb.from('kien').upsert({
                id: rec.id,
                tinh_id: rec.tinh_id,
                diem_id: rec.diem_id,
                mo_ta: rec.mo_ta || null,
                nguoi_nhap: rec.nguoi_nhap || null,
                anh_url,
                created_at: rec.created_at
            })
            if (insErr) throw insErr

            await markKienSynced(rec.id)
            synced++
        } catch (err) {
            console.error('[idb-queue] sync fail', rec.id, err)
            failed++
        }
    }
    return { synced, failed }
}

// Gọi 1 lần khi trang load: sync ngay nếu online, lắng nghe sự kiện 'online',
// và fallback interval phòng khi trình duyệt không bắn 'online' đúng lúc.
function setupQueueAutoSync(sb, { intervalMs = 30000 } = {}) {
    trySyncQueue(sb)
    window.addEventListener('online', () => trySyncQueue(sb))
    setInterval(() => trySyncQueue(sb), intervalMs)
}
