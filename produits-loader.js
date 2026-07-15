// Remplace les cartes/lignes de produits statiques par le catalogue réel
// stocké dans Supabase (table produits, disponible=true uniquement — lecture
// publique). Ne touche à rien si le fetch échoue ou si une catégorie n'a
// aucun produit en base : le contenu statique du HTML reste alors affiché.
(function () {
  const config = window.LOCWEB_CONFIG;
  if (!config || !config.supabaseUrl || !config.clientId) return;

  const endpoint =
    `${config.supabaseUrl}/rest/v1/produits` +
    `?client_id=eq.${encodeURIComponent(config.clientId)}&disponible=eq.true` +
    `&select=nom,prix,description,image_url,categorie&order=nom`;

  fetch(endpoint, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    }
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return res.json();
    })
    .then((produits) => {
      const parCategorie = {};
      produits.forEach((p) => {
        (parCategorie[p.categorie] ??= []).push(p);
      });

      document.querySelectorAll('[data-produits-categorie]').forEach((container) => {
        const items = parCategorie[container.getAttribute('data-produits-categorie')];
        if (!items || items.length === 0) return; // garde le contenu statique par défaut

        const estCarrousel = container.classList.contains('bscroll');
        container.innerHTML = items.map((p) => estCarrousel ? `
          <div class="bcard">
            <div class="btop"><img src="${p.image_url ?? ''}" alt="${p.nom}" loading="lazy"><span class="bprice">${formatPrix(p.prix)}</span></div>
            <div class="bbody"><div class="bname">${p.nom}</div><div class="bdesc">${p.description ?? ''}</div></div>
          </div>
        ` : `
          <div class="mi"><span class="min">${p.nom}${p.description ? `<small>${p.description}</small>` : ''}</span><span class="mip">${formatPrix(p.prix)}</span></div>
        `).join('');
      });
    })
    .catch((err) => {
      console.warn('Produits Supabase indisponibles, menu statique conservé.', err);
    });

  function formatPrix(prix) {
    const s = Number(prix).toFixed(2).replace(/\.?0+$/, '');
    return `${s.replace('.', ',')}€`;
  }
})();
