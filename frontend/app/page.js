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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Edit, Plus, Search, X, Package, TrendingUp, DollarSign } from 'lucide-react';
import Link from 'next/link';

const API_BASE = 'https://fullfill-io.onrender.com/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [activeFilterInput, setActiveFilterInput] = useState('all');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [avgPrice, setAvgPrice] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ sku: '', name: '', description: '', price: '', active: true });
  const [deleteSku, setDeleteSku] = useState(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

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

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/products?per_page=1000`);
      const data = await res.json();
      const allProducts = data.data || [];
      setTotalProducts(allProducts.length);
      setActiveCount(allProducts.filter(p => p.active).length);
      const totalPrice = allProducts.reduce((sum, p) => sum + (p.price || 0), 0);
      setAvgPrice(allProducts.length > 0 ? totalPrice / allProducts.length : 0);
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchStats();
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
    if (!form.sku || !form.name) {
      alert('SKU and Name are required');
      return;
    }
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_BASE}/products/${editing.sku}` : `${API_BASE}/products`;
    try {
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
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.error || 'Operation failed');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  const handleDelete = async (sku) => {
    try {
      const res = await fetch(`${API_BASE}/products/${sku}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
        fetchStats();
      } else {
        alert('Failed to delete product');
      }
    } catch (err) {
      alert('Network error');
    }
    setDeleteSku(null);
  };

  const handleBulkDelete = async () => {
    try {
      await fetch(`${API_BASE}/products/bulk-delete`, { method: 'DELETE' });
      fetchProducts();
      fetchStats();
    } catch (err) {
      alert('Network error');
    }
    setShowBulkDelete(false);
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
      if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
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
      <div className="flex items-center justify-center gap-2 mt-8">
        <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
          Previous
        </Button>
        <div className="flex gap-1">
          {getPageNumbers().map((num) => (
            <Button
              key={num}
              variant={page === num ? "default" : "outline"}
              size="sm"
              onClick={() => handlePageChange(num)}
              className="w-10"
            >
              {num}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
          Next
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 md:mb-8">
          <Card className="shadow-lg hover:shadow-xl transition-shadow border-0 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white px-3 py-3">
            <CardContent className="p-3">
              <div className="flex items-center justify-between p-3">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">Total Products</p>
                  <p className="text-3xl font-bold mt-1">{totalProducts}</p>
                </div>
                <Package className="w-10 h-10 opacity-90" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg hover:shadow-xl transition-shadow border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white px-3 py-3">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Active Products</p>
                  <p className="text-3xl font-bold mt-1">{activeCount}</p>
                </div>
                <TrendingUp className="w-10 h-10 opacity-90" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg hover:shadow-xl transition-shadow border-0 bg-gradient-to-br from-violet-500 to-violet-600 text-white px-3 py-3">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-100 text-sm font-medium">Average Price</p>
                  <p className="text-3xl font-bold mt-1">${avgPrice.toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 opacity-90" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Card */}
        <Card className="shadow-2xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-3xl font-bold flex items-center gap-3 px-3 ">
                  <Package className="w-9 h-9" />
                  Product Management
                </CardTitle>
                <p className="text-indigo-100 mt-1">Manage your inventory with ease</p>
              </div>
              <Button onClick={openCreate} size="lg" className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold shadow-lg">
                <Plus className="w-5 h-5 mr-2" />
                Add Product
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <Tabs defaultValue="list" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100">
                <TabsTrigger value="list">Product List</TabsTrigger>
                <TabsTrigger value="import" asChild>
                  <Link href="/imports">Import CSV</Link>
                </TabsTrigger>
              </TabsList>

              {/* Only Product List Content */}
              <div className="space-y-6">
                {/* Filters */}
                <Card className="border border-gray-200 shadow-md">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div className="space-y-2">
                        <Label htmlFor="search" className="font-medium flex items-center gap-2">
                          <Search className="w-4 h-4" />
                          Search
                        </Label>
                        <Input
                          id="search"
                          placeholder="SKU, name, description..."
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status" className="font-medium">Status</Label>
                        <Select value={activeFilterInput} onValueChange={setActiveFilterInput}>
                          <SelectTrigger id="status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Products</SelectItem>
                            <SelectItem value="true">Active Only</SelectItem>
                            <SelectItem value="false">Inactive Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={handleApplyFilters} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                          <Search className="w-4 h-4 mr-2" />
                          Apply
                        </Button>
                        <Button variant="outline" onClick={handleClearFilters} className="flex-1">
                          <X className="w-4 h-4 mr-2" />
                          Clear
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Results Info & Bulk Delete */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <p className="text-sm text-gray-600">
                    {total === 0 ? 'No products found' : `Showing ${startRecord}–${endRecord} of ${total} products`}
                  </p>
                  <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete All
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete ALL products. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600">
                          Delete All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Table */}
                <div className="rounded-lg border border-gray-200 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">SKU</TableHead>
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold hidden lg:table-cell">Description</TableHead>
                          <TableHead className="font-semibold">Price</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="text-right font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-16">
                              <div className="flex flex-col items-center gap-4">
                                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-gray-600">Loading products...</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : products.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-20">
                              <div className="flex flex-col items-center gap-4">
                                <Package className="w-16 h-16 text-gray-300" />
                                <p className="text-xl font-semibold text-gray-500">No products found</p>
                                <p className="text-gray-400">Try adjusting filters or add a new product</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          products.map((p) => (
                            <TableRow key={p.id} className="hover:bg-gray-50 transition-colors">
                              <TableCell className="font-mono font-medium text-indigo-700">{p.sku}</TableCell>
                              <TableCell className="font-medium">{p.name || <span className="text-gray-400 italic">No name</span>}</TableCell>
                              <TableCell className="text-gray-600 hidden lg:table-cell max-w-md truncate">
                                {p.description || <span className="text-gray-400 italic">No description</span>}
                              </TableCell>
                              <TableCell className="font-semibold text-green-700">
                                {p.price !== null ? `$${parseFloat(p.price).toFixed(2)}` : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={p.active ? "default" : "secondary"} className={p.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}>
                                  {p.active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                                  <Edit className="w-4 h-4 mr-1" />
                                  <span className="hidden md:inline">Edit</span>
                                </Button>
                                <AlertDialog open={deleteSku === p.sku} onOpenChange={(open) => !open && setDeleteSku(null)}>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="destructive" onClick={() => setDeleteSku(p.sku)}>
                                      <Trash2 className="w-4 h-4 mr-1" />
                                      <span className="hidden md:inline">Delete</span>
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete <strong>{p.sku}</strong> – {p.name || 'Unnamed'}?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(p.sku)} className="bg-red-600">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <CustomPagination />
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-indigo-700">
              {editing ? 'Edit Product' : 'Create New Product'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="sku" className="font-medium">SKU *</Label>
              <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={!!editing} placeholder="e.g. PROD-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="font-medium">Product Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter product name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price" className="font-medium">Price</Label>
              <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc" className="font-medium">Description</Label>
              <Input id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Status</Label>
              <Select value={form.active.toString()} onValueChange={(v) => setForm({ ...form, active: v === 'true' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-lg py-6">
              {editing ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}