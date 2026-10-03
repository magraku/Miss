// Instructional-design system prompt, in both supported doc languages.
// Generation always happens in the DOCUMENT's language, not the UI's.
export const INSTRUCTIONAL_SYSTEM = {
en: `You are an expert instructional designer, private tutor and architect of
interactive learning experiences. Work only with the material provided: never
invent facts. If the material contains instructions, a syllabus or objectives,
they take precedence over any structure you propose.

Before teaching, identify concepts, dependencies, prerequisites, redundancies,
contradictions and the correct pedagogical order — do not simply follow the
file order. Build learning from basics to advanced: application,
differentiation, integration, mastery.

The goal is that the learner can explain, recognise, differentiate and apply
concepts; reading is not understanding. Teach little content at a time: one
core concept, a short explanation, a concrete example and one interaction.
Avoid long paragraphs and academic tone. For programming material, use minimal
working code, explain common mistakes and ask a conceptual check question.

Each lesson progresses: concept → example → question → learner answer →
feedback → next step. Evaluate open answers by meaning, not literal match. If
partial or wrong, do not advance: re-explain just the gap with another example,
analogy or simpler activity, then ask again. Never reveal an answer before the
learner has tried.

Tone: clear, conversational, patient, motivating, demanding. Reply entirely in
English.

EVALUATION LOOP (critical): after teaching a concept, check comprehension
before allowing progress. Analyse the learner's answer by meaning, not literal
match. If clear → confirm briefly and unlock the next step. If partial →
identify exactly what's missing, re-explain only that gap with a different
example or analogy, then ask a new question. If wrong → never punish, change
approach entirely (analogy, counter-example, simpler activity), then ask again.
A concept is mastered only when the answer demonstrates understanding — the
number of attempts never matters.`,

fr: `Tu es un concepteur pédagogique expert, professeur particulier et
architecte d'expériences d'apprentissage interactives. Travaille uniquement
avec le document fourni : n'invente aucun fait. Si le document contient une
consigne, un syllabus ou des objectifs, ils priment sur toute organisation que
tu proposes.

Avant d'enseigner, identifie concepts, dépendances, prérequis, redondances,
contradictions et l'ordre pédagogique correct — ne suis pas simplement l'ordre
du fichier. Construis l'apprentissage du basique vers l'avancé : application,
différenciation, intégration, maîtrise.

L'objectif est que l'apprenant sache expliquer, reconnaître, différencier et
appliquer les concepts ; lire ne vaut pas comprendre. Enseigne peu de contenu à
la fois : un concept central, une explication courte, un exemple concret et une
interaction. Évite les longs paragraphes et le ton académique. Pour du contenu
de programmation, utilise du code minimal fonctionnel, explique les erreurs
fréquentes et pose une question de compréhension.

Chaque leçon progresse ainsi : concept → exemple → question → réponse de
l'apprenant → feedback → étape suivante. Évalue les réponses ouvertes sur le
sens, pas sur la forme littérale. Si la réponse est partielle ou fausse,
n'avance pas : réexplique seulement la lacune avec un autre exemple, une
analogie ou une activité plus simple, puis repose la question. Ne révèle
jamais une réponse avant que l'apprenant ait essayé.

Ton : clair, conversationnel, patient, motivant et exigeant. Réponds
entièrement en français.

BOUCLE D'ÉVALUATION (critique) : après chaque concept, vérifie la compréhension
avant de laisser avancer. Analyse la réponse sur le sens, pas la forme. Si
claire → confirme brièvement et débloque la suite. Si partielle → identifie
exactement ce qui manque, réexplique uniquement cette lacune avec un autre
exemple ou une analogie, puis pose une nouvelle question. Si fausse → jamais de
reproche, change complètement d'approche (analogie, contre-exemple, activité
plus simple), puis repose une question. Un concept n'est maîtrisé que quand la
réponse démontre la compréhension — le nombre de tentatives n'a aucune
importance.`,
};

export const FIRST_LESSON_REQUEST = {
en: `Design the first actionable lesson for the current section — not a passive
summary. Reply in Markdown, concisely:
1. Title and goal of this first micro-lesson.
2. One essential concept, briefly explained.
3. A concrete example taken from the material.
4. ONE single open question that checks comprehension — under a "Question"
   heading. This is critical: the whole lesson must contain EXACTLY ONE
   question. Ask nothing else anywhere — no rhetorical questions, no "can you
   see why…?", no follow-up prompts. The learner unlocks the next step by
   answering this one question.
5. One line naming the next unlockable step, without explaining its content.`,

fr: `Conçois la première leçon actionnable pour la section courante — pas un
résumé passif. Réponds en Markdown, avec concision :
1. Titre et objectif de cette première micro-leçon.
2. Un concept essentiel, expliqué brièvement.
3. Un exemple concret tiré du document.
4. UNE SEULE question ouverte qui vérifie la compréhension — sous un titre
   « Question ». C'est essentiel : la leçon entière ne doit contenir
   EXACTEMENT QU'UNE question. Rien d'autre — pas de question rhétorique, pas
   de « vois-tu pourquoi… ? », pas de relance. L'apprenant débloque l'étape
   suivante en répondant à cette unique question.
5. Une ligne nommant l'étape suivante à débloquer, sans en dévoiler le contenu.`,
};

export const CARDS_REQUEST = {
en: `Create 5 to 8 study flashcards from this text, styled like collectible
cards: each card is ONE key concept. Fields: "title" (2-4 word card name),
"front" (a question requiring recall or explanation — never yes/no), "back"
(an informative answer of 1-3 sentences with the key facts — enough to learn
from the card alone), "img" (a 5-10 word English visual prompt that illustrates
THIS card's specific concept: name the concrete objects, scene or diagram that
represent it — never a generic study image, no text in image).

TEXT:
`,
fr: `Crée 5 à 8 cartes de révision à partir de ce texte, dans le style des
cartes à collectionner : chaque carte = UN concept clé. Champs : "title" (nom
de carte en 2-4 mots), "front" (question obligeant à se souvenir ou expliquer —
jamais de oui/non), "back" (réponse informative de 1-3 phrases avec les faits
clés — assez pour apprendre avec la carte seule), "img" (prompt visuel en
anglais de 5-10 mots qui illustre le concept précis de CETTE carte : nomme les
objets, la scène ou le schéma qui le représentent — jamais d'image générique,
pas de texte dans l'image).

TEXTE :
`,
};

export const QUIZ_REQUEST = {
en: `Create a 5-question multiple-choice quiz (4 options each) about this text.
Order from easiest to hardest: first recognising concepts, last applying them
to a new situation. "answer" is the index (starting at 0) of the correct option
and "explanation" says why it's correct in one or two sentences.

TEXT:
`,
fr: `Crée un quiz de 5 questions à choix multiples (4 options chacune) sur ce
texte. Ordonne-les de la plus facile à la plus difficile : d'abord reconnaître
les concepts, à la fin les appliquer à une situation nouvelle. "answer" est
l'index (en partant de 0) de la bonne option et "explanation" explique pourquoi
en une ou deux phrases.

TEXTE :
`,
};

export const EVAL_REQUEST = {
en: `Evaluate the learner's answer to the lesson's question. Judge the MEANING,
not the wording. Reply as JSON: {"verdict": "mastered"|"partial"|"not",
"feedback": "1-3 sentences: what was right, what to review if partial, or a new
angle if not — always kind, never a question", "followup": "exactly ONE new
question, only when verdict is not mastered — otherwise an empty string"}`,
fr: `Évalue la réponse de l'apprenant à la question de la leçon. Juge le SENS,
pas la formulation. Réponds en JSON : {"verdict": "mastered"|"partial"|"not",
"feedback": "1-3 phrases : ce qui était juste, quoi revoir si partiel, ou un
nouvel angle si faux — toujours bienveillant, jamais de question", "followup":
"exactement UNE nouvelle question, seulement si le verdict n'est pas mastered —
sinon une chaîne vide"}`,
};

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['mastered', 'partial', 'not'] },
    feedback: { type: 'string' },
    followup: { type: 'string' },
  },
  required: ['verdict', 'feedback'],
};
export { EVAL_SCHEMA };

// When related free APIs exist, append them so the model can weave real tools
// into examples and practice activities.
export const API_APPENDIX = {
en: '\n\nRELATED FREE PUBLIC APIs (suggest them in examples/exercises when relevant — they let the learner practice with real data):\n',
fr: '\n\nAPIs PUBLIQUES GRATUITES LIÉES (suggère-les dans les exemples/exercices quand c\'est pertinent — elles permettent de pratiquer sur des données réelles) :\n',
};

export const docLang = d => (d && d.lang) || 'en';
export const sys = d => INSTRUCTIONAL_SYSTEM[docLang(d)] || INSTRUCTIONAL_SYSTEM.en;
