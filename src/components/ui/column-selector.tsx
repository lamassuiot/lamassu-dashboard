"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3 } from "lucide-react";

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  disabled?: boolean; // For columns that can't be hidden
}

interface ColumnSelectorProps {
  columns: ColumnConfig[];
  onColumnToggle: (columnId: string) => void;
  align?: "start" | "end" | "center";
}

export function ColumnSelector({
  columns,
  onColumnToggle,
  align = "end",
}: ColumnSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Columns3 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[200px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.visible}
            onCheckedChange={() => !column.disabled && onColumnToggle(column.id)}
            disabled={column.disabled}
            className={column.disabled ? "opacity-50 cursor-not-allowed" : ""}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
