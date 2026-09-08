#!/bin/sh
# Fabrique les visuels du menu a partir des photos brutes du client.
#
# UNE SEULE TAILLE pour tout : 640 x 640. Ce qui fait le rendu Uber
# Eats, ce n'est pas le detourage — leurs vignettes gardent leur decor —
# c'est l'UNIFORMITE. Un carre de 640 sert aussi bien en ligne de liste
# qu'en vignette de grille.
#
# Le recadrage est defini image par image, en fractions, parce que les
# affiches portent leur texte en haut et en bas : « KSM BURGER » au
# dessus, le nom du cru au dessous. On coupe donc dans la zone du plat,
# ce qui supprime le texte sans avoir a le retoucher.
#
# Colonnes : nom | fichier source | x% | y% | cote% (du plus petit cote)
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
SRC="/c/Users/masia/Desktop/ksm photo"
FF=${FF:-ffmpeg}
COTE=640

# On travaille sur des noms stables plutot que sur les UUID du client.
map() {
cat <<'TAB'
bouchees-camembert|0b8e9bac-d59e-4d03-81d5-19fd24baefb6.jpg|50|50|100
le-boursin|0d7dbe5b-0dcf-4b0b-9e5b-8232d0b6212e.jpg|50|43|100
frite-gruyere-bacon|19a0195c-8582-4236-b713-8366e4ee718a.jpg|50|41|100
salade-cesar|1e8fffcf-c3b7-46f5-a3de-ebd8377c5ab2.jpg|50|50|100
le-fleurie|1f546a55-ad61-4151-beba-261bdd9fe96d.jpg|50|44|100
double-cheddar|34af3535-aefa-42ad-a257-0550bb24f336.jpg|50|50|100
le-morgon|413ab2a8-fe0e-4f40-bf9a-6ff9038f99f4.jpg|50|46|100
jalapenos|493a55fe-5b76-4a4c-9ae0-60220dd85f04.jpg|50|50|100
ksm-crousty|537b6604-7dd2-45f1-ad7b-7d013cf7549a.jpg|50|48|100
le-bazooka|5454ac3c-4372-45cf-bee2-326f7c1499fb.jpg|50|46|100
le-triple-julienas|5fc15afa-2cc0-4123-b302-547245de90fb.jpg|50|48|100
le-moulin-a-vent|6a99f8ee-db30-4497-b880-1be85b5a2a93.jpg|50|46|100
le-julienas|6dc4cc38-05a1-4a8d-bf26-cba99aa2887c.jpg|50|50|100
tacos-boursin|701bee39-aad9-40be-94c8-d240c3938d73.jpg|50|0|69
le-saint-amour|7cc344d7-ad60-40e5-9784-bdd7048f32e2.jpg|50|50|100
bouchees-camembert-noir|85dcb6fa-1778-461d-a050-6227c9041d7d.jpg|50|50|75
le-chiroubles|9149c2ee-4bc3-43a2-beba-4b9a5b0c02e7.jpg|50|45|100
mozza-sticks|9e5af501-e76d-4c4d-80f7-31b09a204f96.jpg|50|50|94
le-beaujolais|ad013db4-432f-426d-9ce3-ce8241cd8054.jpg|50|50|75
le-triple-cheese-bacon|b0218c31-4e16-4c51-bea5-9fffce782592.jpg|50|48|100
tenders|b594c10d-b242-451d-bd55-fe8a8c0987c7.jpg|50|50|100
tacos|c9f0f095-251e-46db-9893-e3ae6ede527b.jpg|50|50|100
nuggets|d3300aac-b947-407b-9c63-3a51dab02721.jpg|50|50|67
smash-burger|ff892155-181c-440e-a2ec-429510dace40.jpg|50|51|61
TAB
}

mkdir -p "$ICI"
map | while IFS='|' read -r nom fic px py pc; do
    [ -f "$SRC/$fic" ] || { echo "ABSENT : $fic"; continue; }
    # `min(iw,ih)` : le cote du carre part du plus petit cote de l'image,
    # sinon un portrait donnerait un carre plus haut que large.
    "$FF" -hide_banner -loglevel error -y -i "$SRC/$fic" \
      -vf "crop='min(iw,ih)*$pc/100':'min(iw,ih)*$pc/100':'(iw-min(iw,ih)*$pc/100)*$px/100':'(ih-min(iw,ih)*$pc/100)*$py/100',scale=$COTE:$COTE:flags=lanczos" \
      -quality 82 "$ICI/$nom.webp"
    printf '%-26s %s Ko\n' "$nom" "$(du -k "$ICI/$nom.webp" | cut -f1)"
done
