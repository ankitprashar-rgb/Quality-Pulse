import { getAccessToken } from './googleAuth';

const ROOT_FOLDER_ID = '1JtVjdYIP29GfUyCUqH0A9oTE8W6thYoW';

/**
 * Find or create a folder by name inside a parent folder
 */
async function findOrCreateFolder(folderName, parentId = ROOT_FOLDER_ID) {
    const token = await getAccessToken();
    const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;

    const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // Create folder if not found
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        })
    });

    const createData = await createResponse.json();
    return createData.id;
}

/**
 * Upload a file to a specific folder
 */
export async function uploadFile(file, folderPath) {
    try {
        const token = await getAccessToken();

        // Traverse folder path: [Date, Project, Category]
        let currentParentId = ROOT_FOLDER_ID;
        for (const segment of folderPath) {
            currentParentId = await findOrCreateFolder(segment, currentParentId);
        }

        const metadata = {
            name: `${Date.now()}_${file.name}`,
            parents: [currentParentId]
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Drive upload failed: ${err}`);
        }

        const data = await response.json();

        // Make file public/readable if needed? For now just return link
        // Note: Drive files might need permissions update to be viewable by others
        return data.webViewLink;
    } catch (error) {
        console.error('Error uploading to Drive:', error);
        throw error;
    }
}
