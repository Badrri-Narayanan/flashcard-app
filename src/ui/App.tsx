import { strings } from './strings';

export default function App() {
  return (
    <nav aria-label={strings.nav.main}>
      <span>{strings.app.title}</span>
    </nav>
  );
}
