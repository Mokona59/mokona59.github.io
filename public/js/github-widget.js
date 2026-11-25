(async function(){
  const el = document.getElementById('github-widget');
  if(!el) return;
  const isFrench = document.documentElement.lang.toLowerCase().startsWith('fr');
  try {
    const res = await fetch('https://api.github.com/users/Mokona59');
    if(!res.ok) throw new Error('GitHub API error');
    const u = await res.json();
    const avatar = u.avatar_url ? `${u.avatar_url}&s=96` : '';
    el.innerHTML = `
      <a class="gh-card" href="${u.html_url}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;">
        <img src="${avatar}" alt="${isFrench ? 'Photo de profil de' : 'Avatar of'} ${u.login}" style="width:72px;height:72px;border-radius:8px;object-fit:cover;">
        <div>
          <div style="font-weight:600;">${u.name || u.login}</div>
          <div style="color:var(--muted,#666);margin:6px 0;">${u.bio || ''}</div>
          <div style="font-size:0.9em;color:var(--muted,#666);">${isFrench ? 'Dépôts' : 'Repos'} : ${u.public_repos} · ${isFrench ? 'Abonnés' : 'Followers'} : ${u.followers}</div>
        </div>
      </a>
    `;
  } catch (err) {
    el.textContent = isFrench
      ? 'Profil GitHub indisponible'
      : 'GitHub profile unavailable';
  }
})();
