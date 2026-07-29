import { App } from './App';

const appDiv = document.getElementById('app');
if (appDiv) {
  appDiv.innerHTML = App();
}
