import type { Cuisine } from "../types.js";

/** Küchenrichtung je Katalog-Rezept, für Vorlieben im Ernährungsplan. */
export const RECIPE_CUISINES: Record<string, Cuisine> = {
  // Frühstück
  porridge_beeren: "international", porridge_banane: "international", porridge_apfel: "international",
  joghurt_bowl: "international", overnight_oats: "international", smoothie_bowl: "international",
  chia_pudding: "international", pancakes: "international", avocado_brot: "international",
  tofu_scramble: "international", suesskartoffel_hash: "international", omelett_gemuese: "mediterran",
  quark_beeren: "dach", bircher_muesli: "dach", ruehrei_brot: "dach", broetchen_huettenkaese: "dach",
  bratkartoffeln_ei: "dach", bergkaese_brot: "dach", arme_ritter: "dach",
  // Deutschland, Österreich, Schweiz
  haehnchen_paprika: "dach", lachs_kartoffeln: "dach", putengeschnetzeltes: "dach", schweinefilet_bohnen: "dach",
  linseneintopf: "dach", linsensuppe: "dach", kartoffel_lauch_suppe: "dach", ofenkartoffel_quark: "dach",
  rote_bete_salat: "dach", kaesespaetzle: "dach", kaiserschmarrn: "dach", rindergulasch: "dach",
  schnitzel_kartoffelsalat: "dach", zuercher_geschnetzeltes: "dach", roesti_spiegelei: "dach",
  bratwurst_sauerkraut: "dach", kartoffelpuffer: "dach", pfannkuchen: "dach", linsen_spaetzle: "dach",
  frikadellen_rotkohl: "dach", gefuellte_paprika: "dach", krautfleckerl: "dach", erbsensuppe: "dach",
  aelplermagronen: "dach", flammkuchen: "dach", semmelknoedel_pilze: "dach", kartoffelsalat_schwaebisch: "dach",
  kabeljau_rahmspinat: "dach", bohneneintopf: "dach", kartoffelgratin: "dach", milchreis: "dach", nudelsalat: "dach",
  // Italienisch und mediterran
  nudeln_tomate: "italienisch", spaghetti_bolognese: "italienisch", linsen_bolognese: "italienisch",
  pesto_nudeln: "italienisch", gnocchi_spinat: "italienisch", polenta_pilze: "italienisch", brotsalat: "italienisch",
  lasagne: "italienisch", gemuese_lasagne: "italienisch", pilzrisotto: "italienisch", kuerbisrisotto: "italienisch",
  pizza_margherita: "italienisch", caprese: "italienisch", minestrone: "italienisch", kartoffel_frittata: "italienisch",
  gnocchi_tomate: "italienisch", garnelen_pasta: "italienisch",
  kabeljau_ofen: "mediterran", thunfisch_salat: "mediterran", ofengemuese_feta: "mediterran",
  griechischer_salat: "mediterran", ratatouille: "mediterran", linsensalat: "mediterran",
  // Orient, Indien, Asien, Mexiko
  couscous_salat: "orientalisch", halloumi_pfanne: "orientalisch", shakshuka: "orientalisch",
  kichererbsen_bratlinge: "orientalisch", hummus_teller: "orientalisch",
  linsen_dal: "indisch", kichererbsen_curry: "indisch", blumenkohl_curry: "indisch", haehnchen_joghurt_curry: "indisch",
  thai_curry_garnelen: "asiatisch", tofu_gemuese: "asiatisch", gebratener_reis: "asiatisch", tempeh_bowl: "asiatisch",
  pad_thai: "asiatisch", kokossuppe_haehnchen: "asiatisch", lachs_teriyaki: "asiatisch",
  wraps_haehnchen: "mexikanisch", chili_sin_carne: "mexikanisch", chili_con_carne: "mexikanisch",
  burrito_bowl: "mexikanisch", tacos_hack: "mexikanisch", quesadillas: "mexikanisch",
  // Sonstige
  haehnchen_reis: "international", ofenhaehnchen_suesskartoffel: "international", lachs_spinatreis: "international",
  quinoa_bowl: "international", kuerbissuppe: "international",
};
