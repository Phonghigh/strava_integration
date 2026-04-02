const cleanName = (name) => {
    if (!name) return '';
    // Remove common prefixes like "HCM - 5 -", "HN-1-", "HUE - 2 -"
    return name.replace(/^(hcm|hn|hue|ha noi|ho chi minh|danang|hp|thanh hoa|dong nai)[^a-zA-Z]*/i, '').trim();
};

const normalize = (str) => {
    if (!str) return '';
    const cleaned = cleanName(str);
    return cleaned
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]/g, '') // Keep only alphanumeric
        .trim();
};

console.log('1:', normalize('Hà Nội - 05 Lê Đức Mạnh'));
console.log('2:', normalize('Lê Đức Mạnh'));
console.log('3:', normalize('Kim Huệ'));
console.log('4:', normalize('Lê Thị Kim Huệ'));
console.log('5:', normalize('Bùi Thị Hoài'));
console.log('6:', normalize('Hoai Bui'));
