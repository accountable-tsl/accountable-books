import { SimpleSelect } from "@/components/SimpleSelect";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import React, { useState } from "react";

export function AddAccountSelection() {
  // const [accountType, setAccountType] = useState("");
  // const options = [
  //   { value: "account", label: "Ledger account" },
  //   { value: "bank", label: "Bank account" },
  // ];

  return (
    <>
      <Button size="sm">
        <Plus className="w-4 h-4" /> Add
      </Button>
      <div className="text-sm">
        <div>New account</div>
        <div>Manual bank account</div>
      </div>
    </>
  );
}
