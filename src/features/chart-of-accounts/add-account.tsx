import { SimpleSelect } from "@/components/SimpleSelect";
import { useState } from "react";

export function AddAccountSelection() {
  const [accountType, setAccountType] = useState("");
  const options = [
    { value: "account", label: "Ledger account" },
    { value: "bank", label: "Bank account" },
  ];

  return <></>;
}
