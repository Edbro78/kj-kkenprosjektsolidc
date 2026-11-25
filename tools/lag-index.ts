// Kopierer den ferdigbygde appen (dist/app.html, alt bakt inn i én fil) til index.html i prosjektmappen.
import { copyFileSync, statSync } from 'node:fs';

copyFileSync('dist/app.html', 'index.html');
console.log(`index.html laget (${(statSync('index.html').size / 1e6).toFixed(1)} MB). Dobbeltklikk den for å starte appen.`);
