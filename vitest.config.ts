import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// The site's tests. The application worker (worker/) has its own, run from there: they need a browser.
export default mergeConfig(viteConfig, defineConfig({ test: { exclude: [...configDefaults.exclude, 'worker/**'] } }));
