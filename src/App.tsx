import { useState, useEffect } from 'react';
import { Plus, Search, FileText, Package, Truck, CheckCircle2, ChevronRight, ShoppingCart, Clock, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, updateDoc } from 'firebase/firestore';

// --- Types ---
type OrderStatus = 'PO_RECEIVED' | 'ORDERING' | 'AT_KITCHEN' | 'DELIVERING' | 'COMPLETED';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  supplier: string;
  isOrdered: boolean;
  isAtKitchen: boolean;
  isDelivered: boolean;
  isReceived: boolean;
}

interface PurchaseOrder {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  notes: string;
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'driver' | 'client' | 'kitchen';
}

const statusConfig = {
  PO_RECEIVED: { label: 'PO Diterima', color: 'bg-blue-100 text-blue-800', icon: FileText },
  ORDERING: { label: 'Proses Order', color: 'bg-amber-100 text-amber-800', icon: ShoppingCart },
  AT_KITCHEN: { label: 'Sampai Dapur', color: 'bg-orange-100 text-orange-800', icon: Package },
  DELIVERING: { label: 'Proses Kirim', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  COMPLETED: { label: 'Selesai (Diterima Klien)', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isUserManageOpen, setIsUserManageOpen] = useState(false);

  // New PO Form State
  const [newClientId, setNewClientId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newItems, setNewItems] = useState<Omit<OrderItem, 'id' | 'isOrdered' | 'isAtKitchen' | 'isDelivered' | 'isReceived'>[]>([
    { name: '', quantity: 1, unit: 'pcs', supplier: '' }
  ]);

  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          let profile: UserProfile;
          if (userSnap.exists()) {
            profile = userSnap.data() as UserProfile;
            if (profile.email === 'obym.ppngroup@gmail.com' && profile.role !== 'admin') {
              profile.role = 'admin';
              await updateDoc(userRef, { role: 'admin' });
            }
          } else {
            // Default to client if not exists
            profile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || 'no-email@example.com',
              name: firebaseUser.displayName || 'User',
              role: firebaseUser.email === 'obym.ppngroup@gmail.com' ? 'admin' : 'client'
            };
            await setDoc(userRef, profile);
          }
          setUser(profile);
        } else {
          setUser(null);
        }
      } catch (error: any) {
        console.error("Error in auth state change:", error);
        alert("Gagal memuat profil: " + (error.message || "Terjadi kesalahan"));
        setUser(null);
      } finally {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle Data Fetching
  useEffect(() => {
    if (!isAuthReady || !user) return;

    let q = collection(db, 'purchaseOrders');
    if (user.role === 'client') {
      q = query(collection(db, 'purchaseOrders'), where('clientId', '==', user.uid)) as any;
    }

    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => doc.data() as PurchaseOrder);
      setOrders(fetchedOrders);
      
      // Update selected order if it's open
      if (selectedOrder) {
        const updated = fetchedOrders.find(o => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    }, (error) => {
      console.error("Error fetching orders:", error);
    });

    let unsubscribeClients = () => {};
    let unsubscribeAllUsers = () => {};
    if (user.role === 'admin') {
      const clientsQuery = query(collection(db, 'users'), where('role', '==', 'client'));
      unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
        setClients(snapshot.docs.map(doc => doc.data() as UserProfile));
      });

      const allUsersQuery = query(collection(db, 'users'));
      unsubscribeAllUsers = onSnapshot(allUsersQuery, (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      });
    }

    return () => {
      unsubscribeOrders();
      unsubscribeClients();
      unsubscribeAllUsers();
    };
  }, [isAuthReady, user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      alert("Login gagal: " + (error.message || "Terjadi kesalahan"));
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleAddItem = () => {
    setNewItems([...newItems, { name: '', quantity: 1, unit: 'pcs', supplier: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof typeof newItems[0], value: string | number) => {
    const updated = [...newItems];
    updated[index] = { ...updated[index], [field]: value };
    setNewItems(updated);
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      console.error("Error updating user role:", error);
      alert("Gagal mengupdate role. Periksa koneksi atau hak akses Anda.");
    }
  };

  const handleCreatePO = async () => {
    if (!newClientId || newItems.length === 0 || newItems.some(i => !i.name || !i.supplier)) {
      alert('Mohon lengkapi semua field yang wajib.');
      return;
    }

    const client = clients.find(c => c.uid === newClientId);
    if (!client) return;

    const newPO: PurchaseOrder = {
      id: `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`,
      clientId: client.uid,
      clientName: client.name,
      date: new Date().toISOString(),
      status: 'PO_RECEIVED',
      notes: newNotes,
      items: newItems.map((item, i) => ({
        ...item,
        id: `i-${Date.now()}-${i}`,
        isOrdered: false,
        isAtKitchen: false,
        isDelivered: false,
        isReceived: false,
      })),
    };

    try {
      await setDoc(doc(db, 'purchaseOrders', newPO.id), newPO);
      setIsNewOpen(false);
      setNewClientId('');
      setNewNotes('');
      setNewItems([{ name: '', quantity: 1, unit: 'pcs', supplier: '' }]);
    } catch (error) {
      console.error("Error creating PO:", error);
      alert("Gagal membuat PO. Pastikan Anda memiliki akses Admin.");
    }
  };

  const toggleItemStatus = async (orderId: string, itemId: string, field: keyof OrderItem) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedItems = order.items.map(item => {
      if (item.id !== itemId) return item;
      
      const newItem = { ...item, [field]: !item[field] };
      
      // Logic dependencies
      if (field === 'isReceived' && newItem.isReceived) {
        newItem.isDelivered = true;
        newItem.isAtKitchen = true;
        newItem.isOrdered = true;
      }
      if (field === 'isDelivered' && newItem.isDelivered) {
        newItem.isAtKitchen = true;
        newItem.isOrdered = true;
      }
      if (field === 'isAtKitchen' && newItem.isAtKitchen) {
        newItem.isOrdered = true;
      }
      
      return newItem;
    });

    // Determine new status
    const allReceived = updatedItems.every(i => i.isReceived);
    const allDelivered = updatedItems.every(i => i.isDelivered);
    const allAtKitchen = updatedItems.every(i => i.isAtKitchen);
    const allOrdered = updatedItems.every(i => i.isOrdered);
    const someOrdered = updatedItems.some(i => i.isOrdered);

    let newStatus = order.status;
    if (allReceived) newStatus = 'COMPLETED';
    else if (allDelivered) newStatus = 'DELIVERING'; // Or maybe delivered? Let's say DELIVERING means it's on the way, but if all delivered it's waiting for client to receive.
    else if (allAtKitchen) newStatus = 'DELIVERING'; // Ready to deliver
    else if (allOrdered) newStatus = 'AT_KITCHEN'; // Waiting for kitchen
    else if (someOrdered) newStatus = 'ORDERING';
    else newStatus = 'PO_RECEIVED';

    try {
      await updateDoc(doc(db, 'purchaseOrders', orderId), {
        items: updatedItems,
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating item:", error);
      alert("Gagal mengupdate status. Periksa koneksi atau hak akses Anda.");
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-600 font-medium">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Card className="w-[400px] shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto bg-indigo-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-indigo-600" />
            </div>
            <CardTitle className="text-2xl">PO & Kitchen Tracker</CardTitle>
            <CardDescription>Masuk untuk mengelola pesanan dan pengiriman</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700">
              Login dengan Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredOrders = orders.filter(o => 
    o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderKanbanColumn = (status: OrderStatus) => {
    const columnOrders = filteredOrders.filter(o => o.status === status);
    const config = statusConfig[status];
    const Icon = config.icon;

    // Filter for driver: only show AT_KITCHEN and DELIVERING
    if (user.role === 'driver' && status !== 'AT_KITCHEN' && status !== 'DELIVERING') {
      return null;
    }

    return (
      <div key={status} className="flex flex-col bg-slate-50 rounded-xl p-4 min-w-[300px] max-w-[350px] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-slate-800">{config.label}</h3>
          </div>
          <Badge variant="secondary" className="bg-slate-200 text-slate-700">{columnOrders.length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {columnOrders.map(order => (
            <Card 
              key={order.id} 
              className="cursor-pointer hover:border-slate-400 transition-colors shadow-sm"
              onClick={() => {
                setSelectedOrder(order);
                setIsDetailOpen(true);
              }}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-bold text-slate-800">{order.id}</CardTitle>
                  <Badge className={config.color} variant="outline">{config.label}</Badge>
                </div>
                <CardDescription className="text-xs mt-1 text-slate-500">
                  {new Date(order.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="font-medium text-slate-700 mb-2">{order.clientName}</p>
                
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>{order.items.length} items</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{order.items.filter(i => i.isReceived).length} diterima</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {columnOrders.length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">PO & Kitchen Tracker</h1>
            <Badge variant="outline" className="ml-2 uppercase bg-slate-100">{user.role}</Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input 
                placeholder="Cari PO atau Klien..." 
                className="pl-9 w-[250px] bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {user.role === 'admin' && (
              <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                <DialogTrigger render={<Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" />}>
                  <Plus className="w-4 h-4 mr-2" />
                  PO Baru
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Buat Purchase Order Baru</DialogTitle>
                    <DialogDescription>
                      Masukkan detail PO dari klien untuk mulai dilacak.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientSelect">Pilih Klien <span className="text-red-500">*</span></Label>
                        <select 
                          id="clientSelect"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={newClientId}
                          onChange={(e) => setNewClientId(e.target.value)}
                        >
                          <option value="" disabled>-- Pilih Klien --</option>
                          {clients.map(c => (
                            <option key={c.uid} value={c.uid}>{c.name} ({c.email})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Catatan Tambahan</Label>
                        <Input 
                          id="notes" 
                          placeholder="Contoh: Kirim pagi hari" 
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base">Daftar Barang <span className="text-red-500">*</span></Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                          <Plus className="w-4 h-4 mr-2" /> Tambah Barang
                        </Button>
                      </div>
                      
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Nama Barang</TableHead>
                              <TableHead className="w-[100px]">Qty</TableHead>
                              <TableHead className="w-[120px]">Satuan</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {newItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama barang" 
                                    value={item.name}
                                    onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="number" 
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="kg, pcs..." 
                                    value={item.unit}
                                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama supplier" 
                                    value={item.supplier}
                                    onChange={(e) => handleItemChange(index, 'supplier', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2 text-center">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveItem(index)}
                                    disabled={newItems.length === 1}
                                  >
                                    &times;
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewOpen(false)}>Batal</Button>
                    <Button onClick={handleCreatePO} className="bg-indigo-600 hover:bg-indigo-700">Simpan PO</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {user.role === 'admin' && (
              <Dialog open={isUserManageOpen} onOpenChange={setIsUserManageOpen}>
                <DialogTrigger render={<Button variant="outline" className="ml-2 bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm" />}>
                  <UserIcon className="w-4 h-4 mr-2" />
                  Kelola Pengguna
                </DialogTrigger>
                <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">Kelola Akses Pengguna</DialogTitle>
                    <DialogDescription className="text-base">
                      Atur role untuk setiap email. Role menentukan akses mereka di aplikasi.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="py-4">
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-base">Nama</TableHead>
                            <TableHead className="text-base">Email</TableHead>
                            <TableHead className="w-[250px] text-base">Role</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allUsers.map((u) => (
                            <TableRow key={u.uid}>
                              <TableCell className="font-medium text-base">{u.name}</TableCell>
                              <TableCell className="text-base">{u.email}</TableCell>
                              <TableCell>
                                <select 
                                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-slate-50"
                                  value={u.role}
                                  onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="kitchen">Kitchen</option>
                                  <option value="driver">Driver</option>
                                  <option value="client">Client</option>
                                </select>
                              </TableCell>
                            </TableRow>
                          ))}
                          {allUsers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-slate-500 py-4">Memuat data pengguna...</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button onClick={() => setIsUserManageOpen(false)} className="bg-slate-800 hover:bg-slate-900">Tutup</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            )}

            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-800 leading-none">{user.name}</p>
                <p className="text-xs text-slate-500 mt-1">{user.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
                <LogOut className="w-5 h-5 text-slate-500" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Kanban Board */}
      <main className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 min-w-max pb-4">
          {renderKanbanColumn('PO_RECEIVED')}
          {renderKanbanColumn('ORDERING')}
          {renderKanbanColumn('AT_KITCHEN')}
          {renderKanbanColumn('DELIVERING')}
          {renderKanbanColumn('COMPLETED')}
        </div>
      </main>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-xl flex items-center gap-3">
                    {selectedOrder.id}
                    <Badge className={statusConfig[selectedOrder.status].color} variant="outline">
                      {statusConfig[selectedOrder.status].label}
                    </Badge>
                  </DialogTitle>
                </div>
                <DialogDescription className="text-slate-500 mt-1">
                  Diterima pada {new Date(selectedOrder.date).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6 py-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Klien</p>
                  <p className="font-semibold text-slate-800 text-lg">{selectedOrder.clientName}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Catatan</p>
                  <p className="font-medium text-slate-700">{selectedOrder.notes || '-'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-lg border-b pb-2">Daftar Kebutuhan & Status</h3>
                
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        {(user.role === 'admin' || user.role === 'kitchen') && <TableHead>Supplier</TableHead>}
                        {(user.role === 'admin' || user.role === 'kitchen') && <TableHead className="text-center w-[120px]">Diorder?</TableHead>}
                        {(user.role === 'admin' || user.role === 'kitchen') && <TableHead className="text-center w-[120px]">Sampai Dapur?</TableHead>}
                        {(user.role === 'admin' || user.role === 'driver') && <TableHead className="text-center w-[120px]">Dikirim?</TableHead>}
                        <TableHead className="text-center w-[120px]">Diterima Klien?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item) => (
                        <TableRow key={item.id} className={item.isReceived ? 'bg-emerald-50/50' : ''}>
                          <TableCell>
                            <div className="font-medium text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.quantity} {item.unit}</div>
                          </TableCell>
                          
                          {(user.role === 'admin' || user.role === 'kitchen') && (
                            <TableCell>
                              <Badge variant="outline" className="bg-white text-slate-600 font-normal">
                                {item.supplier}
                              </Badge>
                            </TableCell>
                          )}

                          {(user.role === 'admin' || user.role === 'kitchen') && (
                            <TableCell className="text-center">
                              <Button
                                variant={item.isOrdered ? "default" : "outline"}
                                size="sm"
                                className={`w-full ${item.isOrdered ? 'bg-indigo-600 hover:bg-indigo-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isOrdered')}
                              >
                                {item.isOrdered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                                {item.isOrdered ? 'Ya' : 'Belum'}
                              </Button>
                            </TableCell>
                          )}

                          {(user.role === 'admin' || user.role === 'kitchen') && (
                            <TableCell className="text-center">
                              <Button
                                variant={item.isAtKitchen ? "default" : "outline"}
                                size="sm"
                                className={`w-full ${item.isAtKitchen ? 'bg-orange-600 hover:bg-orange-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isAtKitchen')}
                              >
                                {item.isAtKitchen ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Package className="w-4 h-4 mr-1" />}
                                {item.isAtKitchen ? 'Ya' : 'Belum'}
                              </Button>
                            </TableCell>
                          )}

                          {(user.role === 'admin' || user.role === 'driver') && (
                            <TableCell className="text-center">
                              <Button
                                variant={item.isDelivered ? "default" : "outline"}
                                size="sm"
                                disabled={user.role !== 'driver' && user.role !== 'admin'}
                                className={`w-full ${item.isDelivered ? 'bg-blue-600 hover:bg-blue-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isDelivered')}
                              >
                                {item.isDelivered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                                {item.isDelivered ? 'Ya' : 'Belum'}
                              </Button>
                            </TableCell>
                          )}

                          <TableCell className="text-center">
                            <Button
                              variant={item.isReceived ? "default" : "outline"}
                              size="sm"
                              disabled={user.role !== 'client' && user.role !== 'admin'}
                              className={`w-full ${item.isReceived ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                              onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isReceived')}
                            >
                              {item.isReceived ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                              {item.isReceived ? 'Ya' : 'Belum'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

