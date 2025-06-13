import { CompanyData } from "@/domains/company/types";
import { UserContext } from "@/features/auth/types";
import { MonoWidget } from "../widgets/MonoWidget";
import { MonoConnectCustomer } from "../widgets/types";

export const ProviderWidgets: Record<string, React.FC<any>> = {
  mono: MonoWidget,
  // plaid: PlaidWidget,
  // okra: OkraWidget,
  // etc.
};

export const getProviderData: Record<
  string,
  (user: UserContext, company: CompanyData) => any
> = {
  mono: (user, company): MonoConnectCustomer => {
    if (company?.monoCustomerId) {
      return {
        id: company.monoCustomerId,
      };
    }

    const name = company?.legalName;
    const email = user?.email;

    if (!name || !email) {
      throw new Error("Name and email are required for new Mono customer");
    }

    return {
      name,
      email,
    };
  },
  //   plaid: () => ({}),
  //   okra: (user) => ({
  //     email: user?.email,
  //   }),
};
