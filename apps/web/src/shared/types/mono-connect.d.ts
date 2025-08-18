declare module '@mono.co/connect.js' {
  interface MonoConnectIdentity {
    type: string; // e.g., "bvn"
    number: string;
  }

  type MonoConnectCustomer =
    | {
        id: string; // When id is provided, name and email are not required
        name?: never;
        email?: never;
        identity?: MonoConnectIdentity;
      }
    | {
        id?: never; // When id is not provided, name and email are required
        name: string;
        email: string;
        identity?: MonoConnectIdentity;
      };

  interface MonoConnectConfig {
    key: string;
    data: { customer: MonoConnectCustomer };
    onClose?: () => void;
    onLoad?: () => void;
    onSuccess?: (response: { code: string }) => void;
  }

  class Connect {
    constructor(config: MonoConnectConfig);
    setup(): void;
    open(): void;
  }

  export = Connect;
}
