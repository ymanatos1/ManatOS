/** Public provider-definition shape returned by the external-auth definitions endpoint. */
export interface ExternalAuthProviderDefinition {
  provider: string;
  label: string;
  icon: string;
  scope: string[];
  callbackPath: string;
  tenant?: string;
  generalHelp: {
    title: string;
    steps: string[];
    configuredRule: string;
  };
  secretsHelp: {
    title: string;
    introduction: string;
    sections: Array<{ title: string; steps: string[] }>;
    warning?: string;
  };
}
