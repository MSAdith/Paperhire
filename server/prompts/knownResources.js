// Curated free learning resources for common skills, keyed by the canonical
// names in skillsDictionary.js. Only stable, top-level official docs / course
// pages are listed, so links don't rot or point at made-up content.
const FCC = { title: "freeCodeCamp curriculum", url: "https://www.freecodecamp.org/learn/" };
const FCC_YT = { title: "freeCodeCamp.org (YouTube)", url: "https://www.youtube.com/@freecodecamp" };
const NPTEL = { title: "NPTEL course catalog", url: "https://nptel.ac.in/courses" };

export const CURATED_RESOURCES = {
  JavaScript: [
    { title: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide" },
    { title: "javascript.info", url: "https://javascript.info/" },
    FCC
  ],
  TypeScript: [
    { title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html" },
    FCC_YT
  ],
  Python: [
    { title: "Official Python Tutorial", url: "https://docs.python.org/3/tutorial/" },
    FCC,
    NPTEL
  ],
  Java: [
    { title: "Learn Java (dev.java)", url: "https://dev.java/learn/" },
    NPTEL
  ],
  SQL: [
    { title: "SQLBolt interactive lessons", url: "https://sqlbolt.com/" },
    { title: "PostgreSQL Tutorial (official)", url: "https://www.postgresql.org/docs/current/tutorial.html" }
  ],
  React: [
    { title: "React docs — Learn", url: "https://react.dev/learn" },
    FCC
  ],
  "Node.js": [
    { title: "Node.js — Learn", url: "https://nodejs.org/en/learn" },
    FCC_YT
  ],
  Express: [
    { title: "Express official guide", url: "https://expressjs.com/en/starter/installing.html" },
    { title: "MDN Express/Node tutorial", url: "https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs" }
  ],
  "Next.js": [{ title: "Next.js Learn course", url: "https://nextjs.org/learn" }],
  Angular: [{ title: "Angular tutorials", url: "https://angular.dev/tutorials" }],
  Vue: [{ title: "Vue.js guide", url: "https://vuejs.org/guide/introduction.html" }],
  HTML: [
    { title: "MDN HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML" },
    FCC
  ],
  CSS: [
    { title: "MDN CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
    FCC
  ],
  "Tailwind CSS": [{ title: "Tailwind CSS docs", url: "https://tailwindcss.com/docs" }],
  Git: [
    { title: "Pro Git book (free)", url: "https://git-scm.com/book/en/v2" },
    { title: "Learn Git Branching (interactive)", url: "https://learngitbranching.js.org/" }
  ],
  GitHub: [{ title: "GitHub Docs — Get started", url: "https://docs.github.com/en/get-started" }],
  Docker: [
    { title: "Docker — Get started", url: "https://docs.docker.com/get-started/" },
    FCC_YT
  ],
  Kubernetes: [
    { title: "Kubernetes Basics tutorial", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/" },
    FCC_YT
  ],
  AWS: [
    { title: "AWS Skill Builder (free tier)", url: "https://skillbuilder.aws/" },
    FCC_YT
  ],
  "Microsoft Azure": [{ title: "Microsoft Learn — Azure", url: "https://learn.microsoft.com/en-us/training/azure/" }],
  "Google Cloud": [{ title: "Google Cloud Skills Boost", url: "https://www.cloudskillsboost.google/" }],
  MongoDB: [
    { title: "MongoDB University", url: "https://learn.mongodb.com/" },
    { title: "MongoDB Manual", url: "https://www.mongodb.com/docs/manual/" }
  ],
  PostgreSQL: [{ title: "PostgreSQL Tutorial (official)", url: "https://www.postgresql.org/docs/current/tutorial.html" }],
  MySQL: [{ title: "MySQL Tutorial (official)", url: "https://dev.mysql.com/doc/refman/8.0/en/tutorial.html" }],
  Redis: [{ title: "Redis docs", url: "https://redis.io/docs/latest/" }],
  GraphQL: [{ title: "GraphQL — Learn", url: "https://graphql.org/learn/" }],
  "REST API": [
    { title: "MDN — HTTP overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview" },
    FCC_YT
  ],
  Linux: [
    { title: "Linux Journey", url: "https://linuxjourney.com/" },
    NPTEL
  ],
  "CI/CD": [{ title: "GitHub Actions docs", url: "https://docs.github.com/en/actions" }],
  Jest: [{ title: "Jest — Getting Started", url: "https://jestjs.io/docs/getting-started" }],
  "Machine Learning": [
    { title: "Google Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course" },
    NPTEL
  ],
  "Spring Boot": [{ title: "Spring Guides", url: "https://spring.io/guides" }],
  Django: [{ title: "Django official tutorial", url: "https://docs.djangoproject.com/en/stable/intro/tutorial01/" }],
  Flask: [{ title: "Flask tutorial", url: "https://flask.palletsprojects.com/en/stable/tutorial/" }],
  Pandas: [{ title: "pandas — Getting started", url: "https://pandas.pydata.org/docs/getting_started/index.html" }],
  NumPy: [{ title: "NumPy — Learn", url: "https://numpy.org/learn/" }],
  TensorFlow: [{ title: "TensorFlow tutorials", url: "https://www.tensorflow.org/tutorials" }],
  PyTorch: [{ title: "PyTorch tutorials", url: "https://pytorch.org/tutorials/" }],
  Agile: [{ title: "Atlassian Agile Coach", url: "https://www.atlassian.com/agile" }],
  Scrum: [{ title: "The Scrum Guide", url: "https://scrumguides.org/" }],
  Firebase: [{ title: "Firebase docs", url: "https://firebase.google.com/docs" }],
  PowerBI: [{ title: "Microsoft Learn — Power BI", url: "https://learn.microsoft.com/en-us/training/powerplatform/power-bi" }],
  Tableau: [{ title: "Tableau free training", url: "https://www.tableau.com/learn/training" }]
};

const GENERIC_RESOURCES = [FCC_YT, NPTEL];

const ALLOWED_HOSTS = new Set([
  "freecodecamp.org", "nptel.ac.in", "youtube.com", "developer.mozilla.org", "javascript.info",
  "typescriptlang.org", "docs.python.org", "dev.java", "docs.oracle.com", "sqlbolt.com", "postgresql.org",
  "react.dev", "nodejs.org", "expressjs.com", "nextjs.org", "angular.dev", "vuejs.org", "tailwindcss.com",
  "git-scm.com", "learngitbranching.js.org", "docs.github.com", "docs.docker.com", "kubernetes.io",
  "skillbuilder.aws", "docs.aws.amazon.com", "learn.microsoft.com", "cloud.google.com", "cloudskillsboost.google",
  "learn.mongodb.com", "mongodb.com", "dev.mysql.com", "redis.io", "graphql.org", "linuxjourney.com",
  "jestjs.io", "developers.google.com", "spring.io", "docs.spring.io", "docs.djangoproject.com",
  "flask.palletsprojects.com", "pandas.pydata.org", "numpy.org", "tensorflow.org", "pytorch.org",
  "atlassian.com", "scrumguides.org", "firebase.google.com", "tableau.com", "cs50.harvard.edu",
  "khanacademy.org", "roadmap.sh", "w3schools.com", "kotlinlang.org", "go.dev", "rust-lang.org",
  "docs.flutter.dev", "reactnative.dev", "fastapi.tiangolo.com", "scikit-learn.org"
]);

// Accepts only HTTPS links on allowlisted hosts (subdomains of them included).
// YouTube is limited to channel pages, since individual video IDs are easy for
// a model to make up.
export function isTrustedResourceUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.replace(/^www\./, "");
  const allowed = [...ALLOWED_HOSTS].some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) return false;

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    return /^\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+)\/?$/.test(parsed.pathname);
  }
  return true;
}

export function curatedResourcesFor(skill) {
  return CURATED_RESOURCES[skill] || GENERIC_RESOURCES;
}

// Keeps trusted AI-suggested links, then tops up from the curated list so every
// gap has 2-3 resources, de-duplicated by URL.
export function mergeResources(skill, aiResources = []) {
  const seen = new Set();
  const out = [];
  const push = (r) => {
    if (!r || typeof r.url !== "string" || typeof r.title !== "string") return;
    const key = r.url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ title: r.title, url: r.url });
  };

  aiResources.filter((r) => r && isTrustedResourceUrl(r.url)).forEach(push);
  curatedResourcesFor(skill).forEach(push);
  return out.slice(0, 3);
}
