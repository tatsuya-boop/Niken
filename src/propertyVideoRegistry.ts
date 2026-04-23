import type React from 'react';
import {MargoMain, type MargoProps} from './MargoMain';

declare const require: {
  context: (
    path: string,
    useSubdirectories?: boolean,
    regExp?: RegExp
  ) => {
    keys: () => string[];
    <T = unknown>(id: string): T;
  };
};

type TemplateModule = {
  MargoMain?: React.FC<MargoProps>;
};

const videoTemplateRegistry: Record<string, React.FC<MargoProps>> = (() => {
  const registry: Record<string, React.FC<MargoProps>> = {};
  const context = require.context('./編集指示', false, /\.tsx$/);

  context.keys().forEach((key) => {
    const module = context<TemplateModule>(key);
    if (!module.MargoMain) return;
    const templateName = key.replace(/^\.\//, '').replace(/\.tsx$/, '');
    registry[templateName] = module.MargoMain;
  });

  return registry;
})();

export const resolveVideoTemplateComponent = (
  templateName?: string
): React.FC<MargoProps> => {
  if (templateName && videoTemplateRegistry[templateName]) {
    return videoTemplateRegistry[templateName];
  }
  return videoTemplateRegistry.MargoMain_Original ?? MargoMain;
};
