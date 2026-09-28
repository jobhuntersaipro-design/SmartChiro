/**
 * Clinical (functional) muscle groups — the unit a click selects in the 3D
 * muscle view, e.g. every head of rectus femoris and the three vasti become
 * "Quadriceps". Rules are tried in order against a muscle's base name (side,
 * "head of", "part of" and "set of" stripped), so more specific patterns come
 * first. Each group belongs to exactly one body region (the side-panel group).
 */

export const MUSCLE_GROUPS = [
  // Head
  { key: "mastication", label: "Jaw (mastication)", region: "head", test: /masseter|temporalis\b|pterygoid/ },
  {
    key: "facial",
    label: "Facial expression",
    region: "head",
    test: /frontalis|occipitalis|epicranius|temporoparietalis|orbicularis|corrugator|procerus|nasalis|depressor|levator (labii|anguli)|zygomaticus|risorius|mentalis|buccinator/,
  },
  // Neck
  { key: "suboccipitals", label: "Suboccipitals", region: "neck", test: /rectus capitis posterior|obliquus capitis/ },
  { key: "scalenes", label: "Scalenes", region: "neck", test: /scalenus/ },
  { key: "scm", label: "Sternocleidomastoid", region: "neck", test: /sternocleidomastoid/ },
  {
    key: "deep-neck-flexors",
    label: "Deep neck flexors",
    region: "neck",
    test: /longus colli|longus capitis|rectus capitis (anterior|lateralis)/,
  },
  { key: "hyoid", label: "Hyoid muscles", region: "neck", test: /hyoid|digastric|sternothyroid/ },
  { key: "platysma", label: "Platysma", region: "neck", test: /platysma/ },
  // Back
  { key: "trapezius", label: "Trapezius", region: "back", test: /trapezius/ },
  { key: "latissimus", label: "Latissimus dorsi", region: "back", test: /latissimus/ },
  { key: "rhomboids", label: "Rhomboids & levator scapulae", region: "back", test: /rhomboid|levator scapulae/ },
  { key: "erector-spinae", label: "Erector spinae", region: "back", test: /iliocostalis|longissimus|spinalis (cervicis|thoracis)/ },
  { key: "splenius", label: "Splenius", region: "back", test: /splenius/ },
  { key: "transversospinalis", label: "Multifidus, rotatores & semispinalis", region: "back", test: /semispinalis|multifidus|rotator/ },
  { key: "segmental", label: "Interspinales & intertransversarii", region: "back", test: /interspinales|intertransversari/ },
  { key: "serratus-posterior", label: "Serratus posterior", region: "back", test: /serratus posterior/ },
  // Chest
  { key: "pec-major", label: "Pectoralis major", region: "chest", test: /pectoralis major/ },
  { key: "pec-minor", label: "Pectoralis minor & subclavius", region: "chest", test: /pectoralis minor|subclavius/ },
  { key: "serratus-anterior", label: "Serratus anterior", region: "chest", test: /serratus anterior/ },
  { key: "intercostals", label: "Intercostals", region: "chest", test: /intercostal|transversus thoracis|levatores costarum/ },
  { key: "diaphragm", label: "Diaphragm", region: "chest", test: /diaphragm/ },
  // Abdomen & pelvic floor
  { key: "quadratus-lumborum", label: "Quadratus lumborum", region: "abdomen", test: /quadratus lumborum/ },
  {
    key: "pelvic-floor",
    label: "Pelvic floor",
    region: "abdomen",
    test: /coccygeus|iliococcygeus|puborectalis|levator ani|anal sphincter/,
  },
  {
    key: "abdominal-wall",
    label: "Abdominal wall",
    region: "abdomen",
    test: /rectus abdominis|pyramidalis|linea alba|oblique|transversus abdominis|inguinal/,
  },
  // Shoulder
  { key: "deltoid", label: "Deltoid", region: "shoulder", test: /deltoid/ },
  { key: "rotator-cuff", label: "Rotator cuff", region: "shoulder", test: /supraspinatus|infraspinatus|subscapularis|teres minor/ },
  { key: "teres-major", label: "Teres major", region: "shoulder", test: /teres major/ },
  // Upper arm
  { key: "arm-flexors", label: "Biceps, brachialis & coracobrachialis", region: "arm", test: /biceps brachii|brachialis|coracobrachialis/ },
  { key: "triceps", label: "Triceps & anconeus", region: "arm", test: /triceps brachii|anconeus/ },
  // Forearm & hand — intrinsic hand groups first ("of hand", thumb)
  { key: "hypothenar", label: "Hypothenar", region: "forearm", test: /digiti minimi (brevis )?of hand|digiti minimi of hand/ },
  {
    key: "thenar",
    label: "Thenar (thumb)",
    region: "forearm",
    test: /abductor pollicis brevis|flexor pollicis brevis|opponens pollicis|adductor pollicis/,
  },
  { key: "hand-intrinsics", label: "Lumbricals & interossei (hand)", region: "forearm", test: /lumbricals of hand|interossei of hand/ },
  {
    key: "forearm-extensors",
    label: "Forearm extensors & supinator",
    region: "forearm",
    test: /brachioradialis|extensor (carpi|digitorum|digiti|indicis|pollicis)|abductor pollicis longus|supinator/,
  },
  {
    key: "forearm-flexors",
    label: "Forearm flexors & pronators",
    region: "forearm",
    test: /flexor (carpi|digitorum|pollicis longus|retinaculum)|palmaris|pronator/,
  },
  // Hip
  { key: "gluteals", label: "Gluteals", region: "hip", test: /gluteus/ },
  { key: "iliopsoas", label: "Iliopsoas", region: "hip", test: /iliacus|psoas/ },
  {
    key: "deep-hip-rotators",
    label: "Deep hip rotators",
    region: "hip",
    test: /piriformis|gemellus|obturator|quadratus femoris/,
  },
  { key: "tfl-it-band", label: "TFL & IT band", region: "hip", test: /tensor fasciae latae|iliotibial/ },
  // Thigh
  { key: "quadriceps", label: "Quadriceps", region: "thigh", test: /rectus femoris|vastus/ },
  { key: "hamstrings", label: "Hamstrings", region: "thigh", test: /biceps femoris|semitendinosus|semimembranosus/ },
  { key: "adductors", label: "Adductors", region: "thigh", test: /adductor (brevis|longus|magnus|minimus)|gracilis|pectineus/ },
  { key: "sartorius", label: "Sartorius", region: "thigh", test: /sartorius/ },
  // Leg & foot — foot intrinsics first so "brevis"/"of foot" win
  {
    key: "foot-intrinsics",
    label: "Foot intrinsics",
    region: "leg",
    test: /of foot|abductor hallucis|adductor hallucis|flexor hallucis brevis|flexor digitorum brevis|extensor (digitorum|hallucis) brevis|flexor accessorius/,
  },
  { key: "calf", label: "Calf (gastrocnemius & soleus)", region: "leg", test: /gastrocnemius|soleus|plantaris|calcaneal tendon/ },
  {
    key: "anterior-leg",
    label: "Shin (anterior compartment)",
    region: "leg",
    test: /tibialis anterior|extensor digitorum longus|extensor hallucis longus|fibularis tertius/,
  },
  { key: "fibularis", label: "Fibularis (peroneals)", region: "leg", test: /fibularis (longus|brevis)/ },
  {
    key: "deep-posterior-leg",
    label: "Deep posterior leg",
    region: "leg",
    test: /tibialis posterior|flexor digitorum longus|flexor hallucis longus|popliteus/,
  },
];

/** "long head of right biceps femoris" → "biceps femoris" */
export function muscleBaseName(name) {
  return name
    .toLowerCase()
    .replace(/, nsn$/, "")
    .replace(/\b(right|left)\b ?/g, "")
    .replace(/^(.*?) (head|part|belly) of /, "")
    .replace(/^set of /, "")
    .trim();
}

/** Only groups in the muscle's own region are considered ("extensor digitorum" exists in both forearm and leg). */
export function muscleGroupOf(name, region) {
  const base = muscleBaseName(name);
  return MUSCLE_GROUPS.find((g) => g.region === region && g.test.test(base)) ?? null;
}
