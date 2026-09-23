// Using native fetch in node 24
async function runTest() {
    console.log('Testing CRUD API Laporan...');
    const API = 'http://localhost:3000/api/laporan';
    
    // 1. POST
    console.log('1. Creating Laporan...');
    let res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date: '2026-09-15',
            type: 'Jaringan',
            masalah: 'Test masalah',
            tindakan: 'Test tindakan',
            site: 'Site Alpha',
            technician: 'Test User',
            priority: 'Normal'
        })
    });
    let data = await res.json();
    console.log('Create Response:', data.success);
    const id = data.data._id;
    
    // 2. GET
    console.log('2. Reading Laporan...');
    res = await fetch(API);
    data = await res.json();
    console.log('Read Count:', data.data.length);
    
    // 3. PUT
    console.log('3. Updating Laporan...');
    res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masalah: 'Updated masalah' })
    });
    data = await res.json();
    console.log('Update Result:', data.data.masalah);
    
    // 4. Export CSV
    console.log('4. Exporting Laporan...');
    res = await fetch(`${API}/export/csv`);
    const csv = await res.text();
    console.log('CSV Lines:', csv.split('\n').length);
    
    // 5. DELETE
    console.log('5. Deleting Laporan...');
    res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    data = await res.json();
    console.log('Delete Result:', data.success);
    
    console.log('CRUD Test Done!');
    process.exit(0);
}
runTest().catch(console.error);
