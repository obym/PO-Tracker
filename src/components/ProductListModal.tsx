import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import { Download } from "lucide-react";

interface ProductListModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  orders: any[];
  productsMetadata: any[];
}

export function ProductListModal({
  isOpen,
  onOpenChange,
  orders,
  productsMetadata,
}: ProductListModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const allProducts = useMemo(() => {
    const names = Array.from(
      new Set(
        orders.flatMap((o) => o.items.map((i: any) => i.name.trim().toUpperCase()))
      )
    );
    return names.map((name) => {
      const id = btoa(encodeURIComponent(name)).replace(/=/g, "");
      const meta = productsMetadata.find((p) => p.id === id);
      return {
        id,
        name,
        code: meta?.code || "",
        category: meta?.category || "",
      };
    });
  }, [orders, productsMetadata]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allProducts, searchTerm]);

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setEditCode(product.code);
    setEditCategory(product.category);
  };

  const handleSave = async (product: any) => {
    try {
      await setDoc(doc(db, "products", product.id), {
        name: product.name,
        code: editCode,
        category: editCategory,
      });
      setEditingId(null);
    } catch (error: any) {
      alert("Gagal menyimpan: " + error.message);
    }
  };

  const handleDownloadCsv = () => {
    const headers = ["Nama Barang", "Kode Barang", "Kategori"];
    const rows = filteredProducts.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.code || "").replace(/"/g, '""')}"`,
      `"${(p.category || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "list_produk.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[95vw] max-h-[90vh] flex flex-col overflow-hidden p-6">
        <DialogHeader className="shrink-0 mb-4">
          <DialogTitle className="text-2xl">List Produk</DialogTitle>
          <DialogDescription className="text-base">
            Daftar semua barang yang pernah dibuat nota. Anda dapat menambahkan kode barang dan kategori di sini.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 mb-4 flex gap-4 items-center">
          <Input
            placeholder="Cari barang, kode, atau kategori..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <div className="flex-1"></div>
          <Button
            onClick={handleDownloadCsv}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-md min-h-0 relative">
          <Table className="relative min-w-[1000px] w-full">
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-2/5">Nama Barang</TableHead>
                <TableHead className="w-1/5">Kode Barang</TableHead>
                <TableHead className="w-1/5">Kategori</TableHead>
                <TableHead className="w-1/5 text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium text-slate-800">
                    {product.name}
                  </TableCell>
                  <TableCell>
                    {editingId === product.id ? (
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        placeholder="Kode"
                        className="h-8"
                      />
                    ) : (
                      product.code || "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === product.id ? (
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="Kategori"
                        className="h-8"
                      />
                    ) : (
                      product.category || "-"
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {editingId === product.id ? (
                      <div className="flex justify-center gap-2">
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 h-8"
                          onClick={() => handleSave(product)}
                        >
                          Simpan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setEditingId(null)}
                        >
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(product)}
                        className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                    Tidak ada barang yang ditemukan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
