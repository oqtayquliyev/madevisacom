import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// The site's tests (and the social program's planning rules, which the admin panel shares).
export default mergeConfig(viteConfig, defineConfig({ test: {} }));
