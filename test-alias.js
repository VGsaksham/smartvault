async function test() {
  // First login as admin
  const res = await fetch('http://localhost:5005/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartvault.local', password: 'sanyasi@1981' })
  });
  const data = await res.json();
  const token = data.token;
  console.log("Token acquired:", token.substring(0, 20) + "...");

  const aliasRes = await fetch('http://localhost:5005/api/export/user-aliases/import/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ changes: [{ id: 1, alias: 'My Test Alias 1' }, { id: 2, alias: 'My Test Alias 2' }] })
  });
  console.log("Alias status:", aliasRes.status);
  console.log("Alias response:", await aliasRes.text());
}
test();
