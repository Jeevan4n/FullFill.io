'use client';

import { useState, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API_BASE = 'http://localhost:5000/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [activeFilterInput, setActiveFilterInput] = useState('all');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ sku: '', name: '', description: '', price: '', active: true });

  const fetchProducts = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: '10',
      search,
      ...(activeFilter !== 'all' && { active: activeFilter })
    });
    try {
      const res = await fetch(`${API_BASE}/products?${params}`);
      const data = await res.json();
      setProducts(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, search, activeFilter]);

  const handleApplyFilters = () => {
    setSearch(searchInput.trim());
    setActiveFilter(activeFilterInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setActiveFilterInput('all');
    setSearch('');
    setActiveFilter('all');
    setPage(1);
  };

  const handleSubmit = async () => {
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_BASE}/products/${editing.sku}` : `${API_BASE}/products`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: form.sku.toLowerCase(),
        name: form.name,
        description: form.description || null,
        price: form.price ? parseFloat(form.price) : null,
        active: form.active
      })
    });
    if (res.ok) {
      setOpen(false);
      setEditing(null);
      setForm({ sku: '', name: '', description: '', price: '', active: true });
      fetchProducts();
    } else {
      const err = await res.json();
      alert(err.error || 'Operation failed');
    }
  };

  const handleDelete = async (sku) => {
    if (!confirm('Delete this product?')) return;
    await fetch(`${API_BASE}/products/${sku}`, { method: 'DELETE' });
    fetchProducts();
  };

  const handleBulkDelete = async () => {
    await fetch(`${API_BASE}/products/bulk-delete`, { method: 'DELETE' });
    fetchProducts();
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      sku: p.sku,
      name: p.name || '',
      description: p.description || '',
      price: p.price ?? '',
      active: p.active
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ sku: '', name: '', description: '', price: '', active: true });
    setOpen(true);
  };

  const totalPages = Math.ceil(total / 10);
  const startRecord = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endRecord = Math.min(page * 10, total);

  const CustomPagination = () => {
    if (totalPages <= 1) return null;

    const handlePageChange = (newPage) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    };

    const getPageNumbers = () => {
      const maxPagesToShow = 5;
      let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
      let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
      if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
      const pages = [];
      for (let i = startPage; i <= endPage; i++) pages.push(i);
      return pages;
    };

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className="h-9 px-4"
        >
          Previous
        </Button>

        <div className="flex gap-1">
          {getPageNumbers().map((num) => (
            <Button
              key={num}
              variant={page === num ? "default" : "outline"}
              size="sm"
              onClick={() => handlePageChange(num)}
              className="h-9 w-9"
            >
              {num}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
          className="h-9 px-4"
        >
          Next
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <Card className="max-w-7xl mx-auto shadow-2xl border-0">
        <CardHeader className="border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-3xl font-bold mb-1">Product Management</CardTitle>
              <p className="text-blue-100 text-sm">Manage your product inventory</p>
            </div>
            <Button 
              onClick={openCreate} 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-lg"
            >
              + Add Product
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
              <TabsTrigger value="list" className="text-base">Product List</TabsTrigger>
              <TabsTrigger value="import" onClick={() => window.location.href = '/imports'} className="text-base">
                Import CSV
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-6">
              <Card className="border-2 border-slate-200 shadow-sm">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="search" className="text-sm font-semibold text-slate-700">Search Products</Label>
                      <Input
                        id="search"
                        placeholder="SKU, name, description..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="h-10"
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="status" className="text-sm font-semibold text-slate-700">Status Filter</Label>
                      <Select value={activeFilterInput} onValueChange={setActiveFilterInput}>
                        <SelectTrigger id="status" className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="true">Active Only</SelectItem>
                          <SelectItem value="false">Inactive Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleApplyFilters} className="flex-1 bg-green-600 hover:bg-green-700 h-10">
                        Apply Filters
                      </Button>
                      <Button variant="outline" onClick={handleClearFilters} className="flex-1 h-10">
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between items-center px-1">
                <p className="text-sm text-slate-600 font-medium">
                  {total === 0
                    ? 'No products found'
                    : `Showing ${startRecord}–${endRecord} of ${total} products`}
                </p>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
                      Delete All Products
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete ALL products from your database. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="rounded-lg border-2 border-slate-200 bg-white shadow-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 hover:bg-slate-100">
                      <TableHead className="font-bold text-slate-700">SKU</TableHead>
                      <TableHead className="font-bold text-slate-700">Name</TableHead>
                      <TableHead className="font-bold text-slate-700">Price</TableHead>
                      <TableHead className="font-bold text-slate-700">Status</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-600">Loading products...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-16">
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-slate-500 text-lg">No products found</p>
                            <p className="text-slate-400 text-sm">Try adjusting your filters or add a new product</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((p) => (
                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="font-mono font-semibold text-blue-700">{p.sku}</TableCell>
                          <TableCell className="font-medium">{p.name || <span className="text-slate-400 italic">No name</span>}</TableCell>
                          <TableCell>
                            {p.price !== null && p.price !== undefined ? (
                              <span className="font-bold text-green-700">
                                ${parseFloat(p.price).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={p.active ? "default" : "secondary"}
                              className={
                                p.active
                                  ? "bg-green-100 text-green-800 hover:bg-green-200 font-semibold"
                                  : "bg-red-100 text-red-800 hover:bg-red-200 font-semibold"
                              }
                            >
                              {p.active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => openEdit(p)}
                              className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                            >
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDelete(p.sku)}
                              className="hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <CustomPagination />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{editing ? 'Edit' : 'Create'} Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="sku" className="font-semibold text-slate-700">SKU *</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                disabled={!!editing}
                placeholder="e.g. PROD-001"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="font-semibold text-slate-700">Product Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter product name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price" className="font-semibold text-slate-700">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc" className="font-semibold text-slate-700">Description</Label>
              <Input
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Enter product description"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-slate-700">Status</Label>
              <Select value={form.active.toString()} onValueChange={(v) => setForm({ ...form, active: v === 'true' })}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} size="lg" className="w-full bg-blue-600 hover:bg-blue-700 h-11">
              {editing ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}