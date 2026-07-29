import { Notes } from './Notes';
import { GithubLink } from './GithubLink';

export const App = (): string => {
  return `
    <main>
      ${Notes()}
    </main>
    <footer">
      ${GithubLink()}
    </footer>
    `;
};
