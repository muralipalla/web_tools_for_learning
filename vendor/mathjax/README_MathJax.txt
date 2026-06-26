Optional self-hosted MathJax folder.

The quiz first tries to load:
  ../vendor/mathjax/tex-mml-chtml.js

If this file is not present, it falls back to:
  https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js

To self-host MathJax:
1. Download MathJax v3 from https://github.com/mathjax/MathJax
2. Copy the es5 folder contents needed for tex-mml-chtml.js into this vendor/mathjax folder,
   or install via npm and copy mathjax/es5/* here.
3. Keep the path vendor/mathjax/tex-mml-chtml.js valid.
